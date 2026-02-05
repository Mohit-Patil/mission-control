#!/usr/bin/env node

/**
 * heartbeat-sync-openclaw.mjs
 *
 * Ensures OpenClaw cron jobs exist for each Convex agent.
 * Designed to be run under OpenClaw exec.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

function oc(...args) {
  return sh("openclaw", args);
}

function desired() {
  const out = sh("node", [path.join("scripts", "heartbeat-sync.mjs")]);
  return JSON.parse(out).desired;
}

function listJobs() {
  const raw = oc("cron", "list", "--json");
  return JSON.parse(raw);
}

function addJob(name, expr, message) {
  // OpenClaw CLI cron add supports JSON; but we use gateway tool via cron in agent typically.
  // Here we use CLI for simplicity.
  oc(
    "cron",
    "add",
    "--name",
    name,
    "--cron",
    expr,
    "--session",
    "isolated",
    "--message",
    message
  );
}

function main() {
  const want = desired();
  const jobs = listJobs();
  const existing = new Map();
  for (const j of jobs) existing.set(j.name, j);

  let created = 0;
  for (const w of want) {
    if (existing.has(w.name)) continue;
    const msg = [
      `Mission Control heartbeat (auto): ${w.agentName} in workspace ${w.workspaceSlug}.`,
      `Use missionctl (or scripts) to check tasks + notifications and post an update.`,
      `Run: node scripts/agent-heartbeat.mjs --workspace ${w.workspaceSlug} --agent ${w.agentId}`,
    ].join("\n");
    addJob(w.name, w.cron, msg);
    created++;
  }

  process.stdout.write(JSON.stringify({ ok: true, desired: want.length, created }, null, 2));
}

main();
