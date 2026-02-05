# Mission Control (Next.js + Convex)

A lightweight “Mission Control” dashboard (agents list, kanban tasks, task detail drawer w/ comments thread, and live activity feed) built **Convex-first**.

## Prereqs

- Node.js (repo tested with Node 22)
- A Convex project + deployment URL

## Setup

1) Install deps:

```bash
npm install
```

2) Set your Convex URL (from `npx convex dev` output):

```bash
# .env.local
NEXT_PUBLIC_CONVEX_URL="https://YOUR_DEPLOYMENT.convex.cloud"
```

## Run (2 terminals)

### Terminal A: Convex dev

```bash
npm run convex:dev
```

Optional seed (in the Convex dashboard “Functions” panel) run:

- `seed:run`

Seed is idempotent: it will create a default workspace if missing, then only create missing agents/tasks inside that workspace.

### Terminal B: Next dev (port 3004)

```bash
npm run dev -- -p 3004
```

Open:

- http://localhost:3004

## Workspaces

Mission Control is workspace-scoped.

Routes:

- `/workspaces` — list + create workspaces
- `/w/<slug>` — workspace dashboard
- `/w/<slug>/agents` — per-workspace agent management

The root route `/` redirects to the last opened workspace (stored in `localStorage`), otherwise the first workspace.

### Migrating an existing deployment

If you had data before workspaces existed, run the one-time migration mutation:

- `migrations:migrateToWorkspaces`

This will:

- Create a default workspace (`slug: "default"`) if missing
- Backfill `workspaceId` on existing agents/tasks/messages/activities/documents/notifications

The migration is **idempotent** (safe to run multiple times).

## Scripts

- `npm run lint`
- `npm run build`
- `npm run convex:dev`

## Notes

- **Kanban drag & drop:** drag task cards between columns, or use keyboard:
  - Focus a task card, press `Space` to “pick up”
  - Use `←` / `→` to choose a target column
  - Press `Enter` (or `Space`) to drop, `Esc` to cancel
- **Assignments:** task cards show assignee chips; in the drawer you can assign/unassign agents.
- Posting a comment or changing status creates a clear activity entry in the Live Feed.

## CLI: `missionctl`

A small Node CLI that talks to Convex via `CONVEX_URL`.

```bash
# Ensure this is set (or NEXT_PUBLIC_CONVEX_URL)
export CONVEX_URL="https://YOUR_DEPLOYMENT.convex.cloud"

# Select a workspace (required)
export WORKSPACE_SLUG="default"

# Run directly
node scripts/missionctl.mjs agent status
```

You can also pass `--workspace <slug>` on every command.

Examples:

```bash
# Upsert an agent (by name if it exists)
node scripts/missionctl.mjs agent upsert --workspace default --name Jarvis --role "Ops" --level LEAD --status active

# List tasks
node scripts/missionctl.mjs tasks list --workspace default --status inbox
node scripts/missionctl.mjs tasks list --workspace default --assignee Jarvis

# Move a task
node scripts/missionctl.mjs task updateStatus --workspace default --id <taskId> --status in_progress

# Assign / unassign
node scripts/missionctl.mjs task assign --workspace default --id <taskId> --agent Jarvis
node scripts/missionctl.mjs task unassign --workspace default --id <taskId> --agent Jarvis

# Post a message
node scripts/missionctl.mjs message post --workspace default --task <taskId> --content "Ping @Jarvis for review"
```

## Mentions & Notifications

- In messages, `@AgentName` will create a notification for that agent (within the same workspace).
- `@all` notifies all agents (within the same workspace).

Queries/mutations:

- `notifications.forAgent` (undelivered by default)
- `notifications.totalUndelivered`
- `notifications.markDelivered`

Delivery/integration plan:

- A later OpenClaw cron job (or any scheduler) can poll `notifications.forAgent`, deliver via the desired channel,
  then call `notifications.markDelivered`.
- The UI shows a workspace-scoped **Notifications** counter in the top bar.

## Daily Standup

Convex query: `standup.daily` summarizes the last 24h of activities grouped by agent.

```bash
node scripts/missionctl.mjs standup --workspace default
node scripts/missionctl.mjs standup --workspace default --hours 12
```
