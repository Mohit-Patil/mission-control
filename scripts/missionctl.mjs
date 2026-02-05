#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

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

function usage() {
  console.log(`missionctl - Mission Control CLI\n\nEnvironment:\n  CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL)\n\nCommands:\n  agent status\n  agent upsert --name <name> --role <role> --level <LEAD|SPC|INT> --status <idle|active|blocked> [--id <agentId>]\n\n  tasks list [--status <inbox|assigned|in_progress|review|done|blocked>] [--assignee <agentNameOrId>] [--limit <n>]\n  task updateStatus --id <taskId> --status <status>\n  task assign --id <taskId> --agent <agentNameOrId>\n  task unassign --id <taskId> --agent <agentNameOrId>\n\n  message post --task <taskId> --content <text> [--agent <agentNameOrId>]\n\n  notifications list --agent <agentNameOrId> [--all] [--limit <n>]\n  notifications markDelivered --id <notificationId>\n\n  standup [--hours <n>]\n`);
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

async function getAgentIdByNameOrId(client, nameOrId) {
  if (!nameOrId) return null;
  if (nameOrId.startsWith("\"")) nameOrId = nameOrId.slice(1, -1);
  if (nameOrId.startsWith("agent_")) return nameOrId;

  const agents = await client.query(api.agents.list, {});
  const found = agents.find((a) => a._id === nameOrId || a.name.toLowerCase() === nameOrId.toLowerCase());
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

  if (group === "agent") {
    if (cmd === "status") {
      const agents = await client.query(api.agents.list, {});
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

      const existingId = id || (await getAgentIdByNameOrId(client, name));
      const agentId = await client.mutation(api.agents.upsert, {
        id: existingId || undefined,
        name,
        role,
        level,
        status,
      });
      console.log(agentId);
      return;
    }
  }

  if (group === "tasks" && cmd === "list") {
    const status = args.status || undefined;
    const limit = args.limit ? Number(args.limit) : undefined;
    const assigneeId = await getAgentIdByNameOrId(client, args.assignee);

    const tasks = await client.query(api.tasks.list, {
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
    if (cmd === "updateStatus") {
      const id = args.id;
      const status = args.status;
      if (!id || !status) {
        usage();
        process.exit(2);
      }
      await client.mutation(api.tasks.updateStatus, {
        id,
        status,
        fromHuman: true,
        actorName: "missionctl",
      });
      console.log("OK");
      return;
    }

    if (cmd === "assign" || cmd === "unassign") {
      const id = args.id;
      const agent = args.agent;
      if (!id || !agent) {
        usage();
        process.exit(2);
      }
      const agentId = await getAgentIdByNameOrId(client, agent);
      if (!agentId) {
        console.error(`Unknown agent: ${agent}`);
        process.exit(2);
      }
      await client.mutation(cmd === "assign" ? api.tasks.assign : api.tasks.unassign, {
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
    const agentId = await getAgentIdByNameOrId(client, args.agent);

    await client.mutation(api.messages.create, {
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
      hours,
    });

    console.log(`Standup (last ${res.hours}h) — ${res.totalActivities} activities`);
    for (const b of res.byAgent) {
      const statuses = Object.entries(b.byStatus)
        .sort((a, c) => c[1] - a[1])
        .map(([k, v]) => `${k}:${v}`)
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
      const agentId = await getAgentIdByNameOrId(client, agent);
      if (!agentId) {
        console.error(`Unknown agent: ${agent}`);
        process.exit(2);
      }
      const limit = args.limit ? Number(args.limit) : undefined;
      const undeliveredOnly = args.all ? false : true;

      const rows = await client.query(api.notifications.forAgent, {
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
      await client.mutation(api.notifications.markDelivered, { id });
      console.log("OK");
      return;
    }
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
