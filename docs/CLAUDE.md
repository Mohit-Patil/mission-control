# Mission Control — Architecture & Local Development

This repo is a Next.js + Convex app for managing multi‑agent workspaces. It includes a Kanban board, agents list, activity feed, task drawer, and a safe “Run Now” queue for agent execution.

> This file is meant to help you (or Claude) understand the system quickly and run it locally.

---

## Stack

- **Frontend:** Next.js (App Router)
- **Backend:** Convex (schema + queries + mutations)
- **Scheduling:** OpenClaw cron (agent heartbeats + run queue worker)
- **UI:** Tailwind CSS + custom Mission Control components

---

## Key Features

### Workspace‑scoped data model
All data is partitioned by `workspaceId`:
- `workspaces`
- `agents`
- `tasks`
- `messages`
- `activities`
- `notifications`
- `documents`

### Agent Heartbeats
Each agent has a cron job (every 5 min, staggered). Heartbeats:
- pull assigned tasks
- generate activities + messages
- update task state as needed

Scripts:
- `scripts/agent-heartbeat.mjs`
- `scripts/heartbeat-sync.mjs`
- `scripts/heartbeat-sync-openclaw.mjs`

### Safe “Run Now” Queue
The UI doesn’t trigger agents directly. It creates a `runRequests` record and a worker processes it.

Files:
- `convex/runRequests.ts`
- `scripts/run-queue.mjs`

---

## Local Setup (Dev)

### 1) Install deps
```bash
npm install
```

### 2) Configure environment
Copy/adjust `.env.local`. Required:
```
NEXT_PUBLIC_CONVEX_URL=... (from Convex dashboard)
```

### 3) Run Convex
```bash
npx convex dev
```

### 4) Run Next.js
```bash
npm run dev
```

You should now access:
- `http://localhost:3000`

---

## Production Mode (Local)

```bash
npm run build
npm run start -- --hostname 0.0.0.0 --port 3004
```

---

## Data Model Summary

### workspaces
- `name`, `slug`, `description`

### agents
- `workspaceId`
- `name`, `role`, `level`, `status`
- `prompt`, `systemNotes`, `sessionKey`

### tasks
- `workspaceId`
- `title`, `description`, `status`, `priority`
- `assigneeId`

### activities/messages
- `workspaceId`
- `agentId`
- `content`, timestamps

### runRequests
- `workspaceId`, `agentId`
- `status`: pending/done/failed
- `note`, timestamps

---

## How “Run Now” Works

1. User clicks **Run Now** on `/w/[slug]/agents`.
2. UI calls `runRequests.create`.
3. `scripts/run-queue.mjs` processes pending requests.
4. It triggers the agent’s heartbeat cron job by name:
   `mc-heartbeat:<workspaceSlug>:<agentId>`

---

## Troubleshooting

### Button does nothing
- Confirm UI is rebuilt/restarted in production.
- Check Convex for errors.
- Look for runRequests in the Convex dashboard.

### Heartbeat not firing
- Run `node scripts/agent-heartbeat.mjs` manually to validate.
- Re‑sync cron: `node scripts/heartbeat-sync-openclaw.mjs`

---

## Important Paths

- UI: `src/components/mission-control/*`
- Agents page: `src/app/w/[slug]/agents/page.tsx`
- Convex schema: `convex/schema.ts`
- Cron scripts: `scripts/*.mjs`

---

## Auth & Access

Current setup assumes **no end‑user auth**. Anyone with the URL can access the UI.

If you want authentication later, options include:
- NextAuth (email/OAuth)
- Convex auth providers
- Basic auth in front of Next.js

---

## Deployment Notes

### Convex
- Hosted deployment configured in `.env.local` via `NEXT_PUBLIC_CONVEX_URL`.
- Use `npx convex dev` for local function updates.
- For prod, keep Convex Cloud deployment consistent with your env.

### Next.js
- Production mode:
```bash
npm run build
npm run start -- --hostname 0.0.0.0 --port 3004
```
- Ensure your process manager (systemd/pm2/etc.) restarts the service if it crashes.

---

## Migrations

All migrations are done through Convex functions:

- `convex/migrations.ts`
  - `migrateToWorkspaces`
  - `moveWorkspaceData`
- `convex/admin.ts`
  - `clearTasksAndAgents`

If you need a migration:
1. Add a mutation in `convex/migrations.ts`.
2. Run it once via the Convex dashboard.
3. Remove or leave it for reference.

---

## Ops & Scheduling

OpenClaw cron jobs manage per‑agent heartbeats. The **Run Now** queue is handled by a **systemd timer** (recommended) so it works locally without OpenClaw.

### Heartbeats (OpenClaw)
Key job names:
- `mc-heartbeat:<workspaceSlug>:<agentId>`

Resync:
```bash
node scripts/heartbeat-sync-openclaw.mjs
```

### Run Queue (systemd timer)
Install locally or on server:
```bash
sudo scripts/setup-run-queue.sh
```

This runs `node scripts/run-queue.mjs` every 60s.

**Local fallback:** if OpenClaw isn't installed, the queue worker will call
`node scripts/agent-heartbeat.mjs --workspace <slug> --agent <id>` directly.

### Codex CLI (Route B)
The heartbeat uses a local **Codex CLI** to generate real task updates.

- Command: `codex` (override with `CODEX_CMD` env var)
- Prompt is written to stdin; stdout is posted as a task message.

---

If you want more details (security review, auth implementation, or infra diagrams), I can expand this file further.
