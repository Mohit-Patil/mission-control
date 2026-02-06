#!/usr/bin/env node

/**
 * Dev-mode run-queue poller. Replaces systemd timer during local development.
 * Reads config from .mc-agent.json and polls runRequests.listPending on interval.
 *
 * Lifecycle-bound: started by `concurrently` alongside Next.js dev server.
 * If runQueueEnabled is false, exits cleanly (code 0) so it doesn't kill Next.js.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

function readEnvLocal() {
  try {
    let p = path.join(ROOT, ".env.local");
    if (!fs.existsSync(p)) p = path.join(ROOT, ".env");
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
        (value.startsWith('"') && value.endsWith('"')) ||
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

function loadConfig() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, ".mc-agent.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  process.stdout.write(`[runq ${ts}] ${msg}\n`);
}

// Track in-flight agent heartbeats to prevent overlapping runs
const inFlight = new Set();

function runHeartbeat(workspaceSlug, agentId) {
  return new Promise((resolve) => {
    const key = `${workspaceSlug}:${agentId}`;
    if (inFlight.has(key)) {
      log(`Skipping ${key} — already in flight`);
      resolve(false);
      return;
    }

    inFlight.add(key);
    const child = spawn(
      process.execPath,
      [
        path.join(__dirname, "agent-heartbeat.mjs"),
        "--workspace",
        workspaceSlug,
        "--agent",
        agentId,
        "--force",
      ],
      {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5 * 60 * 1000,
      }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    child.on("close", (code) => {
      inFlight.delete(key);
      if (code === 0) {
        log(`Heartbeat done: ${key} — ${stdout.trim().slice(0, 120)}`);
      } else {
        log(`Heartbeat failed (exit ${code}): ${key} — ${(stderr || stdout).trim().slice(0, 200)}`);
      }
      resolve(code === 0);
    });

    child.on("error", (err) => {
      inFlight.delete(key);
      log(`Heartbeat spawn error: ${key} — ${err.message}`);
      resolve(false);
    });
  });
}

async function poll(client) {
  try {
    const pending = await client.query(api.runRequests.listPending, { limit: 50 });
    if (!pending.length) return;

    log(`Found ${pending.length} pending run request(s)`);

    for (const req of pending) {
      const ws = req.workspaceId
        ? await client.query(api.workspaces.getById, { id: req.workspaceId })
        : null;

      if (!ws) {
        await client.mutation(api.runRequests.markDone, {
          id: req._id,
          status: "failed",
          note: "Workspace not found",
        });
        continue;
      }

      const ok = await runHeartbeat(ws.slug, req.agentId);

      await client.mutation(api.runRequests.markDone, {
        id: req._id,
        status: ok ? "done" : "failed",
        note: ok ? `ran at ${new Date().toISOString()}` : "heartbeat failed",
      });
    }
  } catch (err) {
    log(`Poll error: ${err.message}`);
  }
}

async function main() {
  const config = loadConfig();

  if (config.runQueueEnabled === false) {
    log("Run queue disabled in .mc-agent.json — exiting cleanly");
    process.exit(0);
  }

  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    log("Missing CONVEX_URL/NEXT_PUBLIC_CONVEX_URL — exiting");
    process.exit(0);
  }

  const interval = config.runQueueInterval ?? 30000;
  log(`Starting dev run-queue poller (interval: ${interval}ms)`);

  const client = new ConvexHttpClient(convexUrl);

  // Initial poll
  await poll(client);

  // Recurring poll
  const timer = setInterval(() => poll(client), interval);

  // Clean shutdown
  const cleanup = () => {
    log("Shutting down run-queue poller");
    clearInterval(timer);
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((e) => {
  log(`Fatal: ${e.message}`);
  process.exit(1);
});
