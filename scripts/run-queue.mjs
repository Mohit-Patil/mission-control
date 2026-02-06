#!/usr/bin/env node

/**
 * Process pending run requests by invoking the corresponding OpenClaw heartbeat cron job.
 * Safe queue: UI creates runRequests; this script (run via cron) executes them.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
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

function oc(...args) {
  return execFileSync("openclaw", args, { encoding: "utf8" });
}

function runHeartbeatDirect(workspaceSlug, agentId) {
  return execFileSync(
    process.execPath,
    [path.join(__dirname, "agent-heartbeat.mjs"), "--workspace", workspaceSlug, "--agent", agentId],
    { encoding: "utf8" }
  );
}

async function main() {
  const convexUrl = getConvexUrl();
  if (!convexUrl) throw new Error("Missing CONVEX_URL/NEXT_PUBLIC_CONVEX_URL");

  const client = new ConvexHttpClient(convexUrl);
  const pending = await client.query(api.runRequests.listPending, { limit: 50 });
  if (!pending.length) {
    process.stdout.write("No pending run requests.\n");
    return;
  }

  for (const req of pending) {
    try {
      const ws = req.workspaceId
        ? await client.query(api.workspaces.getById, { id: req.workspaceId })
        : null;
      if (!ws) throw new Error("Workspace not found for request");

      const jobName = `mc-heartbeat:${ws.slug}:${req.agentId}`;
      try {
        oc("cron", "run", "--name", jobName);
      } catch (err) {
        // Local fallback when OpenClaw is not installed.
        if (String(err?.message ?? err).includes("ENOENT")) {
          runHeartbeatDirect(ws.slug, req.agentId);
        } else {
          throw err;
        }
      }

      await client.mutation(api.runRequests.markDone, {
        id: req._id,
        status: "done",
        note: `ran at ${new Date().toISOString()}`,
      });
    } catch (err) {
      await client.mutation(api.runRequests.markDone, {
        id: req._id,
        status: "failed",
        note: String(err?.message ?? err),
      });
    }
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
