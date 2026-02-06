# Mission Control

Multi-agent workspace dashboard built with Next.js 16 + Convex + Tailwind CSS 4.

## Stack

- **Frontend:** Next.js 16 (App Router, React 19)
- **Backend:** Convex Cloud (schema + queries + mutations, real-time subscriptions)
- **Scheduling:** OpenClaw cron (agent heartbeats every 5 min) + systemd timer (run queue every 60s) + dev-runner (local polling)
- **UI:** Tailwind CSS 4 + custom `.mc-*` component classes in `globals.css`
- **CLI:** `missionctl` — Node CLI for agents, tasks, messages, standup

## Project Structure

```
src/app/
  layout.tsx                    # Root layout + ConvexClientProvider
  page.tsx                      # Home — redirects to last workspace
  ConvexClientProvider.tsx      # Convex client init
  workspaces/page.tsx           # Workspace list + create
  w/[slug]/page.tsx             # Workspace dashboard (MissionControlPage)
  w/[slug]/agents/page.tsx      # Agent CRUD + Run Now
  globals.css                   # Tailwind + MC theme vars + .mc-* classes

src/components/mission-control/
  MissionControlPage.tsx        # Main dashboard (~1400 lines): kanban, feed, drawer
  mock-data.ts                  # Legacy type definitions

convex/
  schema.ts                     # 8 tables: workspaces, agents, tasks, messages, activities, documents, notifications, runRequests
  workspaces.ts                 # list, getBySlug, getById, create
  agents.ts                     # list, getById, upsert
  tasks.ts                      # listByStatus, list, create, updateStatus, setAssignees, assign, unassign
  messages.ts                   # listByTask, create (with @mention parsing + notification creation)
  activities.ts                 # create
  liveFeed.ts                   # latest (50 most recent)
  notifications.ts              # forAgent, totalUndelivered, markDelivered
  runRequests.ts                # create, listPending, listForAgent, markDone, clearPending
  seed.ts                       # Idempotent seed (11 agents, 6 tasks)
  migrations.ts                 # migrateToWorkspaces, moveWorkspaceData
  admin.ts                      # clearTasksAndAgents, normalizeAssignedTasks
  standup.ts                    # daily activity summary by agent

scripts/
  missionctl.mjs                # CLI: agent status/upsert, tasks list, task assign/unassign, message post, standup
  run-queue.mjs                 # Process pending runRequests (production, systemd)
  dev-runner.mjs                # Dev-mode run-queue poller (lifecycle-bound, reads .mc-agent.json)
  agent-heartbeat.mjs           # Execute agent heartbeat (uses claude CLI)
  heartbeat-sync.mjs            # Build desired cron schedule
  heartbeat-sync-openclaw.mjs   # Sync crons to OpenClaw
  setup-run-queue.sh            # Install systemd timer
```

## Data Model

All tables are workspace-scoped via `workspaceId`.

- **workspaces**: name, slug (indexed)
- **agents**: name, role, level (LEAD/SPC/INT), status (idle/active/blocked), prompt, systemNotes, sessionKey
- **tasks**: title, description, status (inbox/assigned/in_progress/review/done/blocked), assigneeIds[], tags[], priority
- **messages**: taskId, content, fromAgentId/fromHuman — @mentions create notifications
- **activities**: type, message, agentId — feeds the live feed
- **runRequests**: agentId, status (pending/done/failed), note

## Key Patterns

- **Workspace scoping**: Every query/mutation takes `workspaceId`. No cross-workspace data leaks.
- **Auto-assignment**: Task moved to "assigned" with 0 assignees auto-picks active LEAD agent.
- **Auto-status**: Adding assignees to inbox task auto-moves to "assigned".
- **Mention parsing**: Messages detect `@AgentName` and `@all`, create notification records.
- **Activity logging**: Every mutation creates an activity entry for the live feed.
- **Safe Run Now**: UI creates `runRequests` record; worker processes it (never direct agent trigger).
- **Kanban DnD**: Mouse drag + keyboard (Space pick up, arrows move, Enter drop, Esc cancel).

## Environment

```bash
# .env (or .env.local)
NEXT_PUBLIC_CONVEX_URL=https://valiant-deer-202.convex.cloud
CONVEX_DEPLOYMENT=dev:valiant-deer-202
```

## Commands

```bash
npm run dev              # Next.js + run-queue poller (lifecycle-bound via concurrently)
npm run dev:next         # Next.js dev server only (no run-queue)
npm run build            # Production build
npm run start            # Production server (default port 3000)
npm run convex:dev       # Convex dev (watches for changes)
npm run convex:deploy    # Deploy Convex to production

# Production with custom port
npm run start -- -p 3004

# CLI
node scripts/missionctl.mjs agent status --workspace default
node scripts/missionctl.mjs standup --workspace default
```

## Dev Run Queue (`.mc-agent.json`)

The dev-runner polls for pending `runRequests` during local development, replacing the systemd timer. Config lives in `.mc-agent.json` at the project root:

```json
{
  "workspace": "mission-control",
  "agentName": "MORTYYYY",
  "runQueueEnabled": true,
  "runQueueInterval": 30000
}
```

- `runQueueEnabled`: Set `false` to disable the poller (exits cleanly, Next.js keeps running)
- `runQueueInterval`: Polling interval in ms (default 30000)
- `npm run dev` starts both Next.js and the run-queue poller via `concurrently`
- Agent heartbeats use `claude --print --dangerously-skip-permissions` (falls back to `HEARTBEAT_CMD` env var)

## Coding Conventions

- Path alias: `@/*` maps to `./src/*`
- All Convex functions use `v` validators from `convex/values`
- Convex indexes follow pattern: `by_workspace_<field>`
- CSS uses `.mc-*` namespace for all custom components
- No authentication currently — open access
- No Docker/CI config — manual VPS deployment or Vercel

## Docs

- `docs/CLAUDE.md` — Architecture deep-dive + local dev guide
- `docs/AGENTS.md` — Agent system, heartbeats, Run Now queue
- `docs/cloud.md` — Cloud deployment, systemd, scaling, security
- `CONVEX_SETUP.md` — One-time Convex configuration
- `README.md` — User-facing setup + CLI usage
