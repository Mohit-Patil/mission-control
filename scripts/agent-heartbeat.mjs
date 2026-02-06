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

async function main() {
  const convexUrl = getConvexUrl();
  if (!convexUrl) throw new Error("Missing CONVEX_URL/NEXT_PUBLIC_CONVEX_URL");
  const args = parseArgs(process.argv.slice(2));
  const workspaceSlug = args.workspace;
  const agentId = args.agent;
  if (!workspaceSlug || !agentId) {
    console.error("Usage: --workspace <slug> --agent <agentId>");
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

  process.stdout.write(msg + "\n");
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
