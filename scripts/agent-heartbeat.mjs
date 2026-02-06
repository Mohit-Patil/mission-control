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
    const p = path.join(__dirname, "..", ".env.local");
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

function runCodex(prompt) {
  const cmd = process.env.CODEX_CMD || "codex";
  const res = spawnSync(cmd, ["exec", "-"], {
    input: prompt,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 5,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`codex exited with ${res.status}: ${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
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

  // Auto-progress loop with Codex CLI.
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
      const prompt = [
        `You are ${agentName}${agent?.role ? ` (${agent.role})` : ""}.`,
        `Workspace: ${ws.slug}.`,
        `Task: ${task.title}`,
        task.description ? `Description: ${task.description}` : "",
        "Respond with a concise progress update and next steps.",
      ]
        .filter(Boolean)
        .join("\n");

      let response = "";
      try {
        response = runCodex(prompt);
      } catch (err) {
        response = `Codex error: ${String(err?.message ?? err)}`;
      }

      if (response) {
        await client.mutation(api.messages.create, {
          workspaceId: ws._id,
          taskId: task._id,
          content: response,
          fromAgentId: agentId,
        });
      }

      if (task.status === "assigned" && minutes >= 2) {
        await client.mutation(api.tasks.updateStatus, {
          workspaceId: ws._id,
          id: task._id,
          status: "in_progress",
          fromAgentId: agentId,
        });
      } else if (task.status === "in_progress" && minutes >= 5) {
        await client.mutation(api.tasks.updateStatus, {
          workspaceId: ws._id,
          id: task._id,
          status: "review",
          fromAgentId: agentId,
        });
      } else if (task.status === "review" && minutes >= 5) {
        await client.mutation(api.tasks.updateStatus, {
          workspaceId: ws._id,
          id: task._id,
          status: "done",
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
