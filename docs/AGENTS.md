# Agents Architecture (Mission Control)

This document explains how Mission Control models **agents**, how heartbeats run, and how the safe **Run Now** queue works.

## Overview

Agents are first‑class records in Convex and represent autonomous workers that:
- Own tasks (assigned via Kanban)
- Emit activity logs (for the live feed)
- Receive notifications (mentions)
- Run on a fixed heartbeat schedule (every 5 minutes)

Everything is **workspace‑scoped**. Agents only see tasks and activity in their workspace.

## Core Concepts

### 1) Agents
Stored in `convex/schema.ts` under the `agents` table.

Key fields (high‑level):
- `workspaceId`: workspace foreign key
- `name`, `role`, `level`, `status`
- `sessionKey`: OpenClaw session key for the agent (if linked)
- `prompt`, `systemNotes`: instructions and operational context

**Manual only:** agents are created/edited manually in the UI or via CLI (no autonomous agent creation).

### 2) Tasks
Agents act **only** on tasks assigned to them.

Tasks are stored in `tasks` and scoped by `workspaceId`. When the heartbeat runs, it:
- Fetches assigned tasks for that agent
- Creates activity + messages
- Updates task state when needed

### 3) Heartbeats
Heartbeats run on a 5‑minute cadence (staggered) via OpenClaw cron jobs, one per agent.

Scripts:
- `scripts/agent-heartbeat.mjs`: executes the heartbeat for an agent
- `scripts/heartbeat-sync.mjs`: builds the desired cron schedule
- `scripts/heartbeat-sync-openclaw.mjs`: syncs cron jobs in OpenClaw

Each cron job payload includes “autonomous heartbeat” instructions so the agent can operate without supervision.

### 4) Activities + Notifications
Every agent action writes to:
- `activities`: live feed entries
- `messages`: timeline messages (optional)
- `notifications`: created on @mentions

These are workspace‑scoped and show in the Mission Control UI.

## Safe “Run Now” Queue

The Run Now button does **not** trigger agents directly. It creates a safe run request in Convex.

### Tables + Mutations
`runRequests` table:
- `workspaceId`, `agentId`
- `status`: `pending | done | failed`
- `note`: error/debug message
- timestamps

Convex functions:
- `runRequests.create` — enqueue
- `runRequests.listPending` — fetch pending
- `runRequests.markDone` — mark done/failed

### Worker
`node scripts/run-queue.mjs`
- Polls pending run requests
- Resolves workspace
- Triggers the agent’s heartbeat cron by name: `mc-heartbeat:<workspaceSlug>:<agentId>`
- Marks request done or failed

### Scheduler
A cron job runs every minute:
- **Mission Control: run-queue worker**

This keeps Run Now safe and auditable without exposing a direct trigger endpoint.

## UI Surface

Location: `/w/[slug]/agents`

The Agents page:
- lists agents by workspace
- allows edit/create
- shows **Run Now** button for a selected agent
- shows success/error feedback on Run Now

## Local Dev Notes

The system assumes Convex Cloud + OpenClaw scheduler. For local dev, you can:

1) Run Convex dev:
```bash
npx convex dev
```

2) Run the app:
```bash
npm run dev
```

3) Run an ad‑hoc Run Now worker manually:
```bash
node scripts/run-queue.mjs
```

4) Heartbeats (local):
If you don’t have OpenClaw cron locally, you can invoke:
```bash
node scripts/agent-heartbeat.mjs --workspace <slug> --agent <agentId>
```

(Use an agent from your local data set.)
