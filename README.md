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

Seed is idempotent: it will only create missing agents/tasks, and only add starter message threads when a task thread is empty.

### Terminal B: Next dev (port 3004)

```bash
npm run dev -- -p 3004
```

Open:

- http://localhost:3004

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

# Run directly
node scripts/missionctl.mjs agent status

# Or install a local bin (optional)
npm install
npx missionctl agent status
```

Examples:

```bash
# Upsert an agent (by name if it exists)
node scripts/missionctl.mjs agent upsert --name Jarvis --role "Ops" --level LEAD --status active

# List tasks
node scripts/missionctl.mjs tasks list --status inbox
node scripts/missionctl.mjs tasks list --assignee Jarvis

# Move a task
node scripts/missionctl.mjs task updateStatus --id <taskId> --status in_progress

# Assign / unassign
node scripts/missionctl.mjs task assign --id <taskId> --agent Jarvis
node scripts/missionctl.mjs task unassign --id <taskId> --agent Jarvis

# Post a message
node scripts/missionctl.mjs message post --task <taskId> --content "Ping @Jarvis for review"
```

## Mentions & Notifications

- In messages, `@AgentName` will create a notification for that agent.
- `@all` notifies all agents.

Queries/mutations:

- `notifications.forAgent` (undelivered by default)
- `notifications.totalUndelivered`
- `notifications.markDelivered`

Delivery/integration plan:

- A later OpenClaw cron job (or any scheduler) can poll `notifications.forAgent`, deliver via the desired channel,
  then call `notifications.markDelivered`.
- The UI shows a global **Notifications** counter in the top bar.

## Daily Standup

Convex query: `standup.daily` summarizes the last 24h of activities grouped by agent.

```bash
node scripts/missionctl.mjs standup
node scripts/missionctl.mjs standup --hours 12
```
