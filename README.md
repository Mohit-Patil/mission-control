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

- Task cards open a right-side drawer with details + a realtime message thread.
- Posting a comment or changing status creates a clear activity entry in the Live Feed.
