#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

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
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
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

function usage() {
  console.log(`missionctl - Mission Control CLI\n\nEnvironment:\n  CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL)\n  WORKSPACE_SLUG (optional; can also pass --workspace)\n\nGlobal flags:\n  --workspace <slug>\n\nCommands:\n  agent status\n  agent upsert --name <name> --role <role> --level <LEAD|SPC|INT> --status <idle|active|blocked> [--id <agentId>] [--tags <comma-separated>] [--sessionKey <key>] [--prompt <text>] [--systemNotes <text>]\n  agent setup --name <name> --role <role> --level <LEAD|SPC|INT> --tags <comma-separated> [--worktree-dir <path>]\n\n  tasks list [--status <inbox|assigned|in_progress|review|done|blocked>] [--assignee <agentNameOrId>] [--limit <n>]\n  task get --id <taskId>\n  task messages --id <taskId>\n  task updateStatus --id <taskId> --status <status>\n  task assign --id <taskId> --agent <agentNameOrId>\n  task unassign --id <taskId> --agent <agentNameOrId>\n  task claim --agent <agentNameOrId>\n\n  message post --task <taskId> --content <text> [--agent <agentNameOrId>]\n\n  notifications list --agent <agentNameOrId> [--all] [--limit <n>]\n  notifications markDelivered --id <notificationId>\n\n  standup [--hours <n>]\n`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function getWorkspaceId(client, args) {
  const slug = args.workspace || process.env.WORKSPACE_SLUG;
  if (!slug) {
    usage();
    console.error("\nMissing workspace. Pass --workspace <slug> or set WORKSPACE_SLUG.");
    process.exit(2);
  }

  const ws = await client.query(api.workspaces.getBySlug, { slug });
  if (!ws) {
    console.error(`Unknown workspace: ${slug}`);
    process.exit(2);
  }
  return ws._id;
}

async function getAgentIdByNameOrId(client, workspaceId, nameOrId) {
  if (!nameOrId) return null;
  if (nameOrId.startsWith("\"")) nameOrId = nameOrId.slice(1, -1);
  if (nameOrId.startsWith("agent_")) return nameOrId;

  const agents = await client.query(api.agents.list, { workspaceId });
  const found = agents.find(
    (a) => a._id === nameOrId || a.name.toLowerCase() === nameOrId.toLowerCase()
  );
  return found?._id ?? null;
}

async function main() {
  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    usage();
    console.error("\nMissing CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL). Add it to .env.local or export it.");
    process.exit(2);
  }

  const client = new ConvexHttpClient(convexUrl);

  const args = parseArgs(process.argv.slice(2));
  const [group, cmd] = args._;
  if (!group) {
    usage();
    process.exit(1);
  }

  const workspaceId = await getWorkspaceId(client, args);

  if (group === "agent") {
    if (cmd === "status") {
      const agents = await client.query(api.agents.list, { workspaceId });
      for (const a of agents) {
        console.log(`${a._id}\t${a.name}\t${a.level}\t${a.status}\t${a.role}`);
      }
      return;
    }

    if (cmd === "upsert") {
      const id = args.id || undefined;
      const name = args.name;
      const role = args.role;
      const level = args.level;
      const status = args.status;
      if (!name || !role || !level || !status) {
        usage();
        process.exit(2);
      }

      const tags = args.tags ? String(args.tags).split(",").map((t) => t.trim()).filter(Boolean) : undefined;

      const existingId = id || (await getAgentIdByNameOrId(client, workspaceId, name));
      const agentId = await client.mutation(api.agents.upsert, {
        workspaceId,
        id: existingId || undefined,
        name,
        role,
        level,
        status,
        tags,
        sessionKey: args.sessionKey || undefined,
        prompt: args.prompt || undefined,
        systemNotes: args.systemNotes || undefined,
      });
      console.log(agentId);
      return;
    }

    if (cmd === "setup") {
      const name = args.name;
      const role = args.role || `${name} Agent`;
      const level = args.level || "SPC";
      const tagsRaw = args.tags;
      if (!name || !tagsRaw) {
        console.error("agent setup requires --name and --tags");
        process.exit(2);
      }
      const tags = String(tagsRaw).split(",").map((t) => t.trim()).filter(Boolean);
      const nameLower = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      // 1. Upsert agent in Convex
      const existingId = await getAgentIdByNameOrId(client, workspaceId, name);
      const agentId = await client.mutation(api.agents.upsert, {
        workspaceId,
        id: existingId || undefined,
        name,
        role,
        level,
        status: "active",
        tags,
      });
      console.log(`Agent created: ${agentId} (${name}, tags: ${tags.join(", ")})`);

      // 2. Create git worktree
      const projectRoot = path.join(__dirname, "..");
      const worktreeParent = args["worktree-dir"]
        ? path.resolve(args["worktree-dir"])
        : path.resolve(projectRoot, "..", "mc-agents");
      const worktreePath = path.join(worktreeParent, nameLower);
      const branchName = `agent/${nameLower}`;

      if (!fs.existsSync(worktreeParent)) {
        fs.mkdirSync(worktreeParent, { recursive: true });
      }

      if (fs.existsSync(worktreePath)) {
        console.log(`Worktree already exists: ${worktreePath}`);
      } else {
        try {
          execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
            cwd: projectRoot,
            stdio: "inherit",
          });
        } catch {
          // Branch may already exist — try without -b
          execSync(`git worktree add "${worktreePath}" "${branchName}"`, {
            cwd: projectRoot,
            stdio: "inherit",
          });
        }
        console.log(`Worktree created: ${worktreePath}`);
      }

      // 3. Write .mc-agent.json in worktree
      const slug = args.workspace || process.env.WORKSPACE_SLUG;
      const mcConfig = { workspace: slug, agentName: name };
      fs.writeFileSync(
        path.join(worktreePath, ".mc-agent.json"),
        JSON.stringify(mcConfig, null, 2) + "\n"
      );
      console.log(`Wrote .mc-agent.json in ${worktreePath}`);

      console.log(`\nAgent "${name}" is ready!`);
      console.log(`  Worktree: ${worktreePath}`);
      console.log(`  Branch:   ${branchName}`);
      console.log(`\nTo start working:`);
      console.log(`  cd ${worktreePath}`);
      console.log(`  # Open a new Claude Code session and run /heartbeat`);
      return;
    }
  }

  if (group === "tasks" && cmd === "list") {
    const status = args.status || undefined;
    const limit = args.limit ? Number(args.limit) : undefined;
    const assigneeId = await getAgentIdByNameOrId(client, workspaceId, args.assignee);

    const tasks = await client.query(api.tasks.list, {
      workspaceId,
      status,
      assigneeId: assigneeId || undefined,
      limit,
    });

    for (const t of tasks) {
      const assignees = t.assigneeIds?.length ? t.assigneeIds.join(",") : "";
      console.log(`${t._id}\t${t.status}\t${assignees}\t${t.title}`);
    }
    return;
  }

  if (group === "task") {
    if (cmd === "get") {
      const id = args.id;
      if (!id) {
        usage();
        process.exit(2);
      }
      const task = await client.query(api.tasks.getById, { workspaceId, id });
      if (!task) {
        console.error(`Task not found: ${id}`);
        process.exit(2);
      }
      // Resolve assignee names
      const agents = await client.query(api.agents.list, { workspaceId });
      const agentMap = Object.fromEntries(agents.map((a) => [a._id, a.name]));
      const assigneeNames = (task.assigneeIds ?? []).map((aid) => agentMap[aid] || aid);
      console.log(JSON.stringify({ ...task, assigneeNames }, null, 2));
      return;
    }

    if (cmd === "messages") {
      const id = args.id;
      if (!id) {
        usage();
        process.exit(2);
      }
      const messages = await client.query(api.messages.listByTask, { workspaceId, taskId: id });
      // Resolve agent names
      const agents = await client.query(api.agents.list, { workspaceId });
      const agentMap = Object.fromEntries(agents.map((a) => [a._id, a.name]));
      const enriched = messages.map((m) => ({
        ...m,
        fromAgentName: m.fromAgentId ? agentMap[m.fromAgentId] || m.fromAgentId : null,
      }));
      console.log(JSON.stringify(enriched, null, 2));
      return;
    }

    if (cmd === "updateStatus") {
      const id = args.id;
      const status = args.status;
      if (!id || !status) {
        usage();
        process.exit(2);
      }
      await client.mutation(api.tasks.updateStatus, {
        workspaceId,
        id,
        status,
        fromHuman: true,
        actorName: "missionctl",
      });
      console.log("OK");
      return;
    }

    if (cmd === "claim") {
      const agent = args.agent;
      if (!agent) {
        console.error("task claim requires --agent <agentNameOrId>");
        process.exit(2);
      }
      const agentId = await getAgentIdByNameOrId(client, workspaceId, agent);
      if (!agentId) {
        console.error(`Unknown agent: ${agent}`);
        process.exit(2);
      }
      const taskId = await client.mutation(api.tasks.claimUnassigned, {
        workspaceId,
        agentId,
      });
      if (taskId) {
        const task = await client.query(api.tasks.getById, { workspaceId, id: taskId });
        console.log(`Claimed: ${taskId}\t${task?.title ?? "(unknown)"}`);
      } else {
        console.log("No matching tasks.");
      }
      return;
    }

    if (cmd === "assign" || cmd === "unassign") {
      const id = args.id;
      const agent = args.agent;
      if (!id || !agent) {
        usage();
        process.exit(2);
      }
      const agentId = await getAgentIdByNameOrId(client, workspaceId, agent);
      if (!agentId) {
        console.error(`Unknown agent: ${agent}`);
        process.exit(2);
      }
      await client.mutation(cmd === "assign" ? api.tasks.assign : api.tasks.unassign, {
        workspaceId,
        id,
        agentId,
        fromHuman: true,
        actorName: "missionctl",
      });
      console.log("OK");
      return;
    }
  }

  if (group === "message" && cmd === "post") {
    const taskId = args.task;
    const content = args.content;
    if (!taskId || !content) {
      usage();
      process.exit(2);
    }
    const agentId = await getAgentIdByNameOrId(client, workspaceId, args.agent);

    await client.mutation(api.messages.create, {
      workspaceId,
      taskId,
      content,
      fromAgentId: agentId || undefined,
      fromHuman: !agentId,
      actorName: agentId ? undefined : "missionctl",
    });
    console.log("OK");
    return;
  }

  if (group === "standup") {
    const hours = args.hours ? Number(args.hours) : undefined;
    const res = await client.query(api.standup.daily, {
      workspaceId,
      hours,
    });

    console.log(`Standup (last ${res.hours}h) — ${res.totalActivities} activities`);
    for (const b of res.byAgent) {
      const statuses = Object.entries(b.byStatus)
        .sort((a, c) => c[1] - a[1])
        .map(([k, v2]) => `${k}:${v2}`)
        .join(" ");
      console.log(`\n${b.agentName} — ${b.total}` + (statuses ? ` (status: ${statuses})` : ""));
      for (const m of b.recentMessages) {
        console.log(`- ${new Date(m.createdAt).toISOString()} ${m.message}`);
      }
    }
    return;
  }

  if (group === "notifications") {
    if (cmd === "list") {
      const agent = args.agent;
      if (!agent) {
        usage();
        process.exit(2);
      }
      const agentId = await getAgentIdByNameOrId(client, workspaceId, agent);
      if (!agentId) {
        console.error(`Unknown agent: ${agent}`);
        process.exit(2);
      }
      const limit = args.limit ? Number(args.limit) : undefined;
      const undeliveredOnly = args.all ? false : true;

      const rows = await client.query(api.notifications.forAgent, {
        workspaceId,
        agentId,
        limit,
        undeliveredOnly,
      });
      for (const n of rows) {
        console.log(`${n._id}\t${n.delivered ? "delivered" : "new"}\t${n.content}`);
      }
      return;
    }

    if (cmd === "markDelivered") {
      const id = args.id;
      if (!id) {
        usage();
        process.exit(2);
      }
      await client.mutation(api.notifications.markDelivered, { workspaceId, id });
      console.log("OK");
      return;
    }
  }

  usage();
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
