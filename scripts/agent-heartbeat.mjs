#!/usr/bin/env node

/**
 * One agent heartbeat tick. Pulls notifications + assigned tasks for a workspace/agent
 * and posts a small activity/message.
 *
 * Usage:
 *   node scripts/agent-heartbeat.mjs --workspace <slug> --agent <agentId>
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readEnvLocal() {
  try {
    let p = path.join(__dirname, "..", ".env.local");
    if (!fs.existsSync(p)) p = path.join(__dirname, "..", ".env");
    const txt = fs.readFileSync(p, "utf8");
    const out = {};
    for (const line of txt.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function getConvexUrl() {
  const envLocal = readEnvLocal();
  return (
    process.env.CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    envLocal.CONVEX_URL ||
    envLocal.NEXT_PUBLIC_CONVEX_URL
  );
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function runAgent(prompt, model) {
  const customCmd = process.env.HEARTBEAT_CMD;
  if (customCmd) {
    const res = spawnSync(customCmd, { input: prompt, encoding: "utf8", shell: true, maxBuffer: 1024 * 1024 * 10, timeout: 5 * 60 * 1000 });
    if (res.error) throw res.error;
    if (res.status !== 0) throw new Error(`Custom cmd exited ${res.status}: ${res.stderr || res.stdout}`);
    return (res.stdout || "").trim();
  }

  // Use claude CLI with --print for non-interactive output
  const projectRoot = path.join(__dirname, "..");
  const cliArgs = ["--print", "--dangerously-skip-permissions"];
  if (model) cliArgs.push("--model", model);
  cliArgs.push("-p", prompt);

  const res = spawnSync("claude", cliArgs, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
    timeout: 5 * 60 * 1000,
  });

  if (res.error) {
    // Fallback: try npx claude if bare command fails
    if (res.error.code === "ENOENT") {
      const res2 = spawnSync("npx", ["claude", ...cliArgs], {
        cwd: projectRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 10,
        timeout: 5 * 60 * 1000,
      });
      if (res2.error) throw res2.error;
      if (res2.status !== 0) throw new Error(`claude exited ${res2.status}: ${res2.stderr || res2.stdout}`);
      return (res2.stdout || "").trim();
    }
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`claude exited ${res.status}: ${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
}

// Model selection: COORD uses haiku (cheap, fast), dev agents use default (opus)
const MODEL_BY_LEVEL = {
  COORD: "haiku",
};

async function fetchBoardSnapshot(client, workspaceId) {
  return await client.query(api.coordinator.boardSnapshot, { workspaceId });
}

/**
 * Parse structured ACTION lines from coordinator response.
 * Format: ACTION: <type> | <params as key=value pairs>
 */
function parseCoordinatorActions(response) {
  const actions = [];
  const lines = response.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*ACTION:\s*(\w+)\s*\|(.+)$/);
    if (!match) continue;
    const type = match[1].toUpperCase();
    const paramsStr = match[2];
    const params = {};
    for (const part of paramsStr.split("|")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      params[key] = val;
    }
    actions.push({ type, params });
  }
  return actions;
}

const MAX_ACTIONS_PER_HEARTBEAT = 8;
const MAX_CREATES_PER_HEARTBEAT = 3;

async function executeCoordinatorActions(client, workspaceId, coordinatorId, actions, snapshot) {
  let executed = 0;
  let creates = 0;
  const results = [];

  const agentByName = {};
  for (const a of snapshot.agents) {
    agentByName[a.name.toLowerCase()] = a.id;
  }

  for (const action of actions) {
    if (executed >= MAX_ACTIONS_PER_HEARTBEAT) break;

    try {
      switch (action.type) {
        case "ASSIGN": {
          const taskId = action.params.taskId;
          const agentId = action.params.agentId || agentByName[(action.params.agentName || "").toLowerCase()];
          if (!taskId || !agentId) { results.push(`ASSIGN skipped: missing taskId or agentId`); break; }
          await client.mutation(api.tasks.assign, {
            workspaceId, id: taskId, agentId, fromAgentId: coordinatorId,
          });
          await client.mutation(api.runRequests.create, { workspaceId, agentId });
          results.push(`ASSIGN: task ${taskId} → agent ${agentId} (triggered)`);
          executed++;
          break;
        }
        case "CREATE": {
          if (creates >= MAX_CREATES_PER_HEARTBEAT) { results.push(`CREATE skipped: limit reached`); break; }
          const title = action.params.title;
          if (!title) { results.push(`CREATE skipped: missing title`); break; }
          const tags = (action.params.tags || "").split(",").map(t => t.trim()).filter(Boolean);
          const priority = ["low", "medium", "high"].includes(action.params.priority) ? action.params.priority : undefined;
          await client.mutation(api.tasks.create, {
            workspaceId, title, description: action.params.description || undefined,
            tags: tags.length ? tags : undefined, priority,
          });
          results.push(`CREATE: "${title}"`);
          executed++;
          creates++;
          break;
        }
        case "REASSIGN": {
          const taskId = action.params.taskId;
          const fromAgentId = action.params.fromAgentId || agentByName[(action.params.fromAgentName || "").toLowerCase()];
          const toAgentId = action.params.toAgentId || agentByName[(action.params.toAgentName || "").toLowerCase()];
          if (!taskId || !toAgentId) { results.push(`REASSIGN skipped: missing params`); break; }
          if (fromAgentId) {
            await client.mutation(api.tasks.unassign, {
              workspaceId, id: taskId, agentId: fromAgentId, fromAgentId: coordinatorId,
            });
          }
          await client.mutation(api.tasks.assign, {
            workspaceId, id: taskId, agentId: toAgentId, fromAgentId: coordinatorId,
          });
          await client.mutation(api.runRequests.create, { workspaceId, agentId: toAgentId });
          results.push(`REASSIGN: task ${taskId} → agent ${toAgentId} (triggered)`);
          executed++;
          break;
        }
        case "TRIGGER": {
          const agentId = action.params.agentId || agentByName[(action.params.agentName || "").toLowerCase()];
          if (!agentId) { results.push(`TRIGGER skipped: missing agentId`); break; }
          await client.mutation(api.runRequests.create, { workspaceId, agentId });
          results.push(`TRIGGER: agent ${agentId}`);
          executed++;
          break;
        }
        case "STATUS": {
          const taskId = action.params.taskId;
          const status = action.params.status;
          const validStatuses = ["inbox", "assigned", "in_progress", "review", "done"];
          if (!taskId || !validStatuses.includes(status)) { results.push(`STATUS skipped: invalid`); break; }
          await client.mutation(api.tasks.updateStatus, {
            workspaceId, id: taskId, status, fromAgentId: coordinatorId,
          });
          results.push(`STATUS: task ${taskId} → ${status}`);
          executed++;
          break;
        }
        default:
          results.push(`Unknown action: ${action.type}`);
      }
    } catch (err) {
      results.push(`${action.type} error: ${String(err?.message ?? err)}`);
    }
  }

  return results;
}

async function main() {
  const convexUrl = getConvexUrl();
  if (!convexUrl) throw new Error("Missing CONVEX_URL/NEXT_PUBLIC_CONVEX_URL");
  const args = parseArgs(process.argv.slice(2));
  const workspaceSlug = args.workspace;
  const agentId = args.agent;
  const force = Boolean(args.force);
  if (!workspaceSlug || !agentId) {
    console.error("Usage: --workspace <slug> --agent <agentId> [--force]");
    process.exit(2);
  }

  const client = new ConvexHttpClient(convexUrl);
  const ws = await client.query(api.workspaces.getBySlug, { slug: workspaceSlug });
  if (!ws) throw new Error(`Workspace not found: ${workspaceSlug}`);

  const undelivered = await client.query(api.notifications.forAgent, {
    workspaceId: ws._id,
    agentId,
    undeliveredOnly: true,
    limit: 20,
  });

  const tasks = await client.query(api.tasks.list, {
    workspaceId: ws._id,
    assigneeId: agentId,
    limit: 20,
  });

  // Post a small activity note so you can see heartbeats.
  const agent = (await client.query(api.agents.getById, { workspaceId: ws._id, id: agentId })) ?? null;
  const agentName = agent?.name ?? agentId;

  // ── Coordinator path ──────────────────────────────────────
  if (agent?.level === "COORD") {
    const snapshot = await fetchBoardSnapshot(client, ws._id);

    const inboxCount = snapshot.tasks.filter(t => t.status === "inbox").length;
    const activeCount = snapshot.tasks.filter(t => ["assigned", "in_progress", "review"].includes(t.status)).length;
    const agentCount = snapshot.agents.length;

    const msg = `${agentName} coordination: ${inboxCount} inbox, ${activeCount} active, ${agentCount} agents`;

    await client.mutation(api.activities.create, {
      workspaceId: ws._id,
      type: "coordination",
      agentId,
      message: msg,
    });

    // Build coordinator prompt
    const agentRoster = snapshot.agents
      .filter(a => a.level !== "COORD")
      .map(a => `- ${a.name} (${a.role}, ${a.level}, ${a.status}) tags:[${a.tags.join(",")}] load:${a.activeTaskCount}`)
      .join("\n");

    const taskListStr = snapshot.tasks
      .filter(t => t.status !== "done")
      .map(t => {
        const assignees = t.assigneeIds.map(id => {
          const a = snapshot.agents.find(ag => ag.id === id);
          return a ? a.name : id;
        }).join(", ") || "(unassigned)";
        const age = Math.round((Date.now() - t.updatedAt) / 60000);
        return `- [${t.id}] "${t.title}" status:${t.status} priority:${t.priority || "none"} tags:[${t.tags.join(",")}] assignees:[${assignees}] age:${age}min`;
      })
      .join("\n");

    const recentFeed = snapshot.recentActivity
      .slice(0, 15)
      .map(a => `- [${a.type}] ${a.message}`)
      .join("\n");

    const prompt = [
      `You are JARVIS, the coordinator agent for workspace "${ws.slug}".`,
      `Your job is to keep the team productive: triage inbox tasks, detect stuck work, break down large tasks, rebalance load, and create missing tasks.`,
      "",
      "## Agent Roster",
      agentRoster,
      "",
      "## Task Board (non-done)",
      taskListStr || "(no active tasks)",
      "",
      "## Recent Activity (last 15)",
      recentFeed || "(no recent activity)",
      "",
      "## Your Capabilities",
      "Output structured ACTION lines to take coordination actions. Each action MUST be on its own line.",
      "Available actions:",
      "",
      "  ACTION: ASSIGN | taskId=<id> | agentName=<name>",
      "    Assign an unassigned inbox task to an agent. Picks the best match by tags + lowest load.",
      "",
      "  ACTION: CREATE | title=<title> | description=<desc> | tags=<comma-sep> | priority=<low|medium|high>",
      "    Create a new task. Use for subtask breakdown or identified gaps. Max 3 per heartbeat.",
      "",
      "  ACTION: REASSIGN | taskId=<id> | fromAgentName=<name> | toAgentName=<name>",
      "    Move a stuck/blocked task to a different agent.",
      "",
      "  ACTION: TRIGGER | agentName=<name>",
      "    Wake up an agent immediately (creates a Run Now request).",
      "",
      "  ACTION: STATUS | taskId=<id> | status=<inbox|assigned|in_progress|review|done>",
      "    Change a task's status (e.g., move stale tasks back to inbox for re-triage).",
      "",
      "## Rules",
      "1. Triage ALL inbox tasks — match task tags to agent tags, assign to the agent with lowest load.",
      "2. If no tag match, assign to an active LEAD agent.",
      "3. Flag tasks stuck in assigned/in_progress for >30 min with no recent activity.",
      "4. Never assign tasks to yourself (JARVIS).",
      "5. Never reassign tasks that are in review or done.",
      "6. When creating subtasks, include the parent task ID in the tags as 'parent:<taskId>'.",
      "7. Max 8 total actions per heartbeat. Max 3 CREATE actions.",
      "8. After all actions, write a brief coordination summary (2-3 sentences).",
      "",
      "Think step by step about the board state, then output your actions and summary.",
    ].join("\n");

    let response = "";
    try {
      response = runAgent(prompt, MODEL_BY_LEVEL.COORD);
    } catch (err) {
      response = `Coordinator error: ${String(err?.message ?? err)}`;
    }

    // Parse and execute actions
    const actions = parseCoordinatorActions(response);
    const results = await executeCoordinatorActions(client, ws._id, agentId, actions, snapshot);

    // Post coordination summary to activity feed
    const summaryMsg = results.length
      ? `${agentName} executed ${results.length} actions:\n${results.join("\n")}`
      : `${agentName} coordination: no actions taken`;

    await client.mutation(api.activities.create, {
      workspaceId: ws._id,
      type: "coordination",
      agentId,
      message: summaryMsg,
    });

    // Post comments on affected tasks
    const affectedTaskIds = new Set();
    for (const action of actions) {
      if (action.params.taskId) affectedTaskIds.add(action.params.taskId);
    }
    for (const taskId of affectedTaskIds) {
      const relevantResults = results.filter(r => r.includes(taskId));
      if (relevantResults.length === 0) continue;
      try {
        await client.mutation(api.messages.create, {
          workspaceId: ws._id,
          taskId,
          content: `[JARVIS coordination] ${relevantResults.join("; ")}`,
          fromAgentId: agentId,
        });
      } catch {
        // Task may not exist if it was just created; skip
      }
    }

    process.stdout.write(msg + "\n");
    if (results.length) process.stdout.write(results.join("\n") + "\n");
    return;
  }
  // ── End coordinator path ──────────────────────────────────

  const topTask = tasks[0];
  const summary = topTask ? `top: “${topTask.title}” (${topTask.status})` : null;

  const msg =
    undelivered.length || tasks.length
      ? `${agentName} heartbeat: ${tasks.length} tasks / ${undelivered.length} notifications${summary ? ` • ${summary}` : ""}`
      : `${agentName} heartbeat: idle`;

  await client.mutation(api.activities.create, {
    workspaceId: ws._id,
    type: "heartbeat",
    agentId,
    message: msg,
  });

  // Build a lookup for agent names (used in prompt context).
  const allAgents = await client.query(api.agents.list, { workspaceId: ws._id });
  const agentNameById = (id) => (allAgents ?? []).find((a) => a._id === id)?.name ?? "Agent";

  // Auto-progress loop with Claude CLI.
  const now = Date.now();
  const task = tasks.find((t) => ["assigned", "in_progress", "review"].includes(t.status));
  if (task) {
    const ageMs = now - (task.updatedAt ?? task.createdAt ?? now);
    const minutes = ageMs / 60000;

    const messages = await client.query(api.messages.listByTask, {
      workspaceId: ws._id,
      taskId: task._id,
    });
    const lastAgentMsg = [...messages].reverse().find((m) => m.fromAgentId === agentId);
    const sinceAgentMsg = lastAgentMsg ? (now - lastAgentMsg.createdAt) / 60000 : Infinity;

    const shouldWork =
      force ||
      (task.status === "assigned" && minutes >= 2) ||
      (task.status === "in_progress" && minutes >= 5) ||
      (task.status === "review" && minutes >= 5);

    if (shouldWork && (force || sinceAgentMsg >= 2)) {
      // Move to in_progress immediately when picking up an assigned task
      if (task.status === "assigned") {
        await client.mutation(api.tasks.updateStatus, {
          workspaceId: ws._id,
          id: task._id,
          status: "in_progress",
          fromAgentId: agentId,
        });
      }

      const recentMessages = messages.slice(-5).map((m) => {
        const who = m.fromHuman ? "Human" : (m.fromAgentId ? agentNameById(m.fromAgentId) : "System");
        return `${who}: ${m.content}`;
      }).join("\n");

      const prompt = [
        `You are ${agentName}${agent?.role ? ` (${agent.role})` : ""}, an AI agent working on a Mission Control task.`,
        `Workspace: ${ws.slug}.`,
        `Task: ${task.title} (status: ${task.status})`,
        task.description ? `Description: ${task.description}` : "",
        recentMessages ? `\nRecent conversation:\n${recentMessages}` : "",
        "",
        "You are in the mission-control project directory. Do real coding work on this task:",
        "1. Read relevant files to understand the codebase",
        "2. Make concrete code changes to progress the task",
        "3. Respond with a concise summary of what you did and what remains",
        "",
        "Focus on making real, useful changes. Do not just describe what you would do.",
        "",
        "IMPORTANT: At the very end of your response, you MUST include exactly one of these status lines",
        "to indicate where this task should move to next:",
        "",
        "  STATUS: in_progress   — you started work but more remains",
        "  STATUS: review        — you finished the work and it needs human review",
        "  STATUS: done          — the task is fully complete, no further work needed",
        "",
        "Choose the status that honestly reflects the state of the work. Do not default to in_progress",
        "if the work is actually complete.",
      ]
        .filter(Boolean)
        .join("\n");

      let response = "";
      try {
        response = runAgent(prompt);
      } catch (err) {
        response = `Agent error: ${String(err?.message ?? err)}`;
      }

      if (response) {
        await client.mutation(api.messages.create, {
          workspaceId: ws._id,
          taskId: task._id,
          content: response,
          fromAgentId: agentId,
        });
      }

      // Parse agent-declared status from response
      const statusMatch = response.match(/\bSTATUS:\s*(in_progress|review|done)\b/i);
      const declaredStatus = statusMatch ? statusMatch[1].toLowerCase() : null;

      const VALID_TRANSITIONS = {
        in_progress: ["review", "done"],
        review: ["done"],
      };

      const allowed = VALID_TRANSITIONS[task.status] ?? [];

      if (declaredStatus && allowed.includes(declaredStatus)) {
        await client.mutation(api.tasks.updateStatus, {
          workspaceId: ws._id,
          id: task._id,
          status: declaredStatus,
          fromAgentId: agentId,
        });
      }
    }
  }

  process.stdout.write(msg + "\n");
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
