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
  const parsed = JSON.parse(raw);
  return parsed.jobs ?? parsed;
}

function addJob(name, expr, message) {
  // Use --no-deliver to avoid noisy announcements.
  oc(
    "cron",
    "add",
    "--name",
    name,
    "--cron",
    expr,
    "--session",
    "isolated",
    "--no-deliver",
    "--message",
    message
  );
}

function editJob(id, expr, message) {
  oc(
    "cron",
    "edit",
    id,
    "--cron",
    expr,
    "--session",
    "isolated",
    "--no-deliver",
    "--message",
    message
  );
}

function main() {
  const want = desired();
  const jobs = listJobs();
  const existing = new Map();
  for (const j of jobs) existing.set(j.name, j);

  // Precompute existing names for debugging.

  let created = 0;
  let updated = 0;
  for (const w of want) {
    const msg = [
      `You are ${w.agentName}${w.agentRole ? ` (${w.agentRole})` : ""}.`,
      `Workspace: ${w.workspaceSlug}.`,
      w.agentPrompt ? `Agent prompt: ${w.agentPrompt}` : "",
      w.agentNotes ? `System notes: ${w.agentNotes}` : "",
      "\nMission: manage your assigned tasks autonomously.",
      "Steps each heartbeat:",
      `1) List assigned tasks: node scripts/missionctl.mjs tasks list --workspace ${w.workspaceSlug} --assignee \"${w.agentName}\"`,
      "2) If none: reply HEARTBEAT_OK and exit.",
      "3) Pick 1-3 most important tasks. For each:",
      "   - Post an update comment with next steps via missionctl message post",
      "   - Move status (in_progress/review/done) if appropriate via missionctl task updateStatus",
      "4) If blocked, say why in the comment and set status blocked.",
      "5) Keep responses concise and actionable.",
    ]
      .filter(Boolean)
      .join("\n");

    const existingJob = existing.get(w.name);
    if (!existingJob) {
      addJob(w.name, w.cron, msg);
      created++;
      continue;
    }

    const needsCron = existingJob.schedule?.expr !== w.cron;
    const needsMessage = existingJob.payload?.message !== msg;
    if (needsCron || needsMessage) {
      editJob(existingJob.id, w.cron, msg);
      updated++;
    }
  }

  process.stdout.write(
    JSON.stringify({ ok: true, desired: want.length, created, updated }, null, 2)
  );
}

main();
