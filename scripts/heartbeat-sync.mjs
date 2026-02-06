#!/usr/bin/env node

/**
 * Sync OpenClaw cron heartbeats for Mission Control agents.
 *
 * Expects:
 * - NEXT_PUBLIC_CONVEX_URL in .env.local or env
 * - openclaw gateway cron jobs are managed outside this script (this script only prints desired jobs)
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

function minuteOffset(key) {
  // Stable 0..4 offset (5-minute cadence)
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 5;
}

async function main() {
  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    console.error("Missing NEXT_PUBLIC_CONVEX_URL/CONVEX_URL");
    process.exit(2);
  }

  const client = new ConvexHttpClient(convexUrl);
  const workspaces = await client.query(api.workspaces.list, {});

  const desired = [];
  for (const ws of workspaces) {
    const agents = await client.query(api.agents.list, { workspaceId: ws._id });
    for (const a of agents) {
      const off = minuteOffset(`${ws.slug}:${a._id}`);
      const cronExpr = `${off}-59/5 * * * *`;
      desired.push({
        name: `mc-heartbeat:${ws.slug}:${a._id}`,
        workspaceSlug: ws.slug,
        workspaceId: ws._id,
        agentId: a._id,
        agentName: a.name,
        agentRole: a.role,
        agentPrompt: a.prompt || "",
        agentNotes: a.systemNotes || "",
        cron: cronExpr,
      });
    }
  }

  process.stdout.write(JSON.stringify({ desired }, null, 2));
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
