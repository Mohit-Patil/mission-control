# JARVIS Coordinator Agent — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a JARVIS coordinator agent that triages inbox tasks, monitors stuck work, breaks down tasks into subtasks, creates new tasks, rebalances agent load, and auto-triggers agents — all on a 15-min hybrid heartbeat.

**Architecture:** Extend the existing agent model with a new `COORD` level. The coordinator heartbeat is a code path inside the existing `agent-heartbeat.mjs` that builds a full board snapshot, sends it to Claude with a coordinator-specific prompt, and parses structured `ACTION:` lines from the response to execute mutations (assign, create, reassign, trigger). One COORD agent per workspace.

**Tech Stack:** Convex schema + mutations, Node.js heartbeat script, Claude CLI (`--print`), Next.js UI (badge/level updates)

---

## Task 1: Add COORD level to schema + agents.upsert

**Files:**
- Modify: `convex/schema.ts:23` (agent level union)
- Modify: `convex/agents.ts:35` (upsert level validator)

**Step 1: Add COORD to the agent level union in schema**

In `convex/schema.ts:23`, change:

```ts
level: v.union(v.literal("LEAD"), v.literal("SPC"), v.literal("INT")),
```

to:

```ts
level: v.union(v.literal("COORD"), v.literal("LEAD"), v.literal("SPC"), v.literal("INT")),
```

**Step 2: Add COORD to agents.upsert validator**

In `convex/agents.ts:35`, change:

```ts
level: v.union(v.literal("LEAD"), v.literal("SPC"), v.literal("INT")),
```

to:

```ts
level: v.union(v.literal("COORD"), v.literal("LEAD"), v.literal("SPC"), v.literal("INT")),
```

**Step 3: Verify Convex schema pushes cleanly**

Run: `npx convex dev` (let it push schema, then Ctrl+C)
Expected: Schema accepted, no errors.

**Step 4: Commit**

```bash
git add convex/schema.ts convex/agents.ts
git commit -m "feat: add COORD level to agent schema for coordinator agent"
```

---

## Task 2: Add boardSnapshot Convex query

The coordinator needs a single query that returns the full board state: all agents, all non-done tasks, and recent feed activity.

**Files:**
- Create: `convex/coordinator.ts`

**Step 1: Create the coordinator query file**

Create `convex/coordinator.ts`:

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Full board snapshot for the JARVIS coordinator.
 * Returns all agents, all non-done tasks, and recent activity.
 */
export const boardSnapshot = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_workspace_name", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_workspace_updated", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(500);

    // Exclude done tasks older than 24h to keep context manageable
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const tasks = allTasks.filter(
      (t) => t.status !== "done" || t.updatedAt > oneDayAgo
    );

    const recentActivity = await ctx.db
      .query("activities")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(30);

    // Compute load per agent (count of non-done tasks assigned)
    const loadByAgent: Record<string, number> = {};
    for (const agent of agents) {
      loadByAgent[agent._id] = 0;
    }
    for (const task of tasks) {
      if (task.status === "done") continue;
      for (const aid of task.assigneeIds ?? []) {
        loadByAgent[aid] = (loadByAgent[aid] ?? 0) + 1;
      }
    }

    return {
      agents: agents.map((a) => ({
        id: a._id,
        name: a.name,
        role: a.role,
        level: a.level,
        status: a.status,
        tags: a.tags ?? [],
        activeTaskCount: loadByAgent[a._id] ?? 0,
      })),
      tasks: tasks.map((t) => ({
        id: t._id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        tags: t.tags ?? [],
        assigneeIds: t.assigneeIds ?? [],
        updatedAt: t.updatedAt,
        createdAt: t.createdAt,
      })),
      recentActivity: recentActivity.map((a) => ({
        type: a.type,
        message: a.message,
        agentId: a.agentId,
        createdAt: a.createdAt,
      })),
    };
  },
});
```

**Step 2: Verify Convex picks up the new file**

Run: `npx convex dev` (let it push, then Ctrl+C)
Expected: `coordinator.ts` functions registered, no errors.

**Step 3: Commit**

```bash
git add convex/coordinator.ts
git commit -m "feat: add boardSnapshot query for coordinator agent"
```

---

## Task 3: Extend agent-heartbeat.mjs with COORD code path

This is the core change. When the heartbeat detects a COORD-level agent, it fetches the board snapshot instead of a single task, builds a coordinator prompt, and parses structured actions from the response.

**Files:**
- Modify: `scripts/agent-heartbeat.mjs`

**Step 1: Add board snapshot fetch function after the existing `runAgent` function (~line 110)**

After the `runAgent` function, add:

```js
async function fetchBoardSnapshot(client, workspaceId) {
  return await client.query(api.coordinator.boardSnapshot, { workspaceId });
}
```

**Step 2: Add action parser function after fetchBoardSnapshot**

```js
/**
 * Parse structured ACTION lines from coordinator response.
 * Format: ACTION: <type> | <params as key=value pairs>
 * Examples:
 *   ACTION: ASSIGN | taskId=abc123 | agentId=def456
 *   ACTION: CREATE | title=Write API docs | tags=docs,api | priority=medium
 *   ACTION: REASSIGN | taskId=abc123 | fromAgentId=old | toAgentId=new
 *   ACTION: TRIGGER | agentId=def456
 *   ACTION: STATUS | taskId=abc123 | status=blocked
 */
function parseCoordinatorActions(response) {
  const actions = [];
  const lines = response.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*ACTION:\s*(\w+)\s*\|(.+)$/);
    if (!match) continue;
    const type = match[1].toUpperCase();
    const paramsStr = match[2];
    const params = {};
    for (const part of paramsStr.split("|")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      params[key] = val;
    }
    actions.push({ type, params });
  }
  return actions;
}
```

**Step 3: Add coordinator action executor function**

```js
const MAX_ACTIONS_PER_HEARTBEAT = 8;
const MAX_CREATES_PER_HEARTBEAT = 3;

async function executeCoordinatorActions(client, workspaceId, coordinatorId, actions, snapshot) {
  let executed = 0;
  let creates = 0;
  const results = [];

  // Build lookup maps from snapshot
  const agentByName = {};
  for (const a of snapshot.agents) {
    agentByName[a.name.toLowerCase()] = a.id;
  }
  const taskById = {};
  for (const t of snapshot.tasks) {
    taskById[t.id] = t;
  }

  for (const action of actions) {
    if (executed >= MAX_ACTIONS_PER_HEARTBEAT) break;

    try {
      switch (action.type) {
        case "ASSIGN": {
          const taskId = action.params.taskId;
          const agentId = action.params.agentId || agentByName[(action.params.agentName || "").toLowerCase()];
          if (!taskId || !agentId) { results.push(`ASSIGN skipped: missing taskId or agentId`); break; }
          await client.mutation(api.tasks.assign, {
            workspaceId, id: taskId, agentId, fromAgentId: coordinatorId,
          });
          // Auto-trigger the assigned agent
          await client.mutation(api.runRequests.create, { workspaceId, agentId });
          results.push(`ASSIGN: task ${taskId} → agent ${agentId} (triggered)`);
          executed++;
          break;
        }
        case "CREATE": {
          if (creates >= MAX_CREATES_PER_HEARTBEAT) { results.push(`CREATE skipped: limit reached`); break; }
          const title = action.params.title;
          if (!title) { results.push(`CREATE skipped: missing title`); break; }
          const tags = (action.params.tags || "").split(",").map(t => t.trim()).filter(Boolean);
          const priority = ["low", "medium", "high"].includes(action.params.priority) ? action.params.priority : undefined;
          await client.mutation(api.tasks.create, {
            workspaceId, title, description: action.params.description || undefined,
            tags: tags.length ? tags : undefined, priority,
          });
          results.push(`CREATE: "${title}"`);
          executed++;
          creates++;
          break;
        }
        case "REASSIGN": {
          const taskId = action.params.taskId;
          const fromAgentId = action.params.fromAgentId || agentByName[(action.params.fromAgentName || "").toLowerCase()];
          const toAgentId = action.params.toAgentId || agentByName[(action.params.toAgentName || "").toLowerCase()];
          if (!taskId || !toAgentId) { results.push(`REASSIGN skipped: missing params`); break; }
          if (fromAgentId) {
            await client.mutation(api.tasks.unassign, {
              workspaceId, id: taskId, agentId: fromAgentId, fromAgentId: coordinatorId,
            });
          }
          await client.mutation(api.tasks.assign, {
            workspaceId, id: taskId, agentId: toAgentId, fromAgentId: coordinatorId,
          });
          // Auto-trigger the new assignee
          await client.mutation(api.runRequests.create, { workspaceId, agentId: toAgentId });
          results.push(`REASSIGN: task ${taskId} → agent ${toAgentId} (triggered)`);
          executed++;
          break;
        }
        case "TRIGGER": {
          const agentId = action.params.agentId || agentByName[(action.params.agentName || "").toLowerCase()];
          if (!agentId) { results.push(`TRIGGER skipped: missing agentId`); break; }
          await client.mutation(api.runRequests.create, { workspaceId, agentId });
          results.push(`TRIGGER: agent ${agentId}`);
          executed++;
          break;
        }
        case "STATUS": {
          const taskId = action.params.taskId;
          const status = action.params.status;
          const validStatuses = ["inbox", "assigned", "in_progress", "review", "done", "blocked"];
          if (!taskId || !validStatuses.includes(status)) { results.push(`STATUS skipped: invalid`); break; }
          await client.mutation(api.tasks.updateStatus, {
            workspaceId, id: taskId, status, fromAgentId: coordinatorId,
          });
          results.push(`STATUS: task ${taskId} → ${status}`);
          executed++;
          break;
        }
        default:
          results.push(`Unknown action: ${action.type}`);
      }
    } catch (err) {
      results.push(`${action.type} error: ${String(err?.message ?? err)}`);
    }
  }

  return results;
}
```

**Step 4: Add coordinator heartbeat path inside the `main()` function**

In the `main()` function, after fetching the agent (~line 142), add a branch that checks for COORD level. This should go right after `const agentName = agent?.name ?? agentId;` and before the existing `const topTask = tasks[0];` line. The COORD branch handles the entire heartbeat and returns early:

```js
  // ── Coordinator path ──────────────────────────────────────
  if (agent?.level === "COORD") {
    const snapshot = await fetchBoardSnapshot(client, ws._id);

    const inboxCount = snapshot.tasks.filter(t => t.status === "inbox").length;
    const blockedCount = snapshot.tasks.filter(t => t.status === "blocked").length;
    const activeCount = snapshot.tasks.filter(t => ["assigned", "in_progress", "review"].includes(t.status)).length;
    const agentCount = snapshot.agents.length;

    const msg = `${agentName} coordination: ${inboxCount} inbox, ${activeCount} active, ${blockedCount} blocked, ${agentCount} agents`;

    await client.mutation(api.activities.create, {
      workspaceId: ws._id,
      type: "coordination",
      agentId,
      message: msg,
    });

    // Build coordinator prompt
    const agentRoster = snapshot.agents
      .filter(a => a.level !== "COORD")
      .map(a => `- ${a.name} (${a.role}, ${a.level}, ${a.status}) tags:[${a.tags.join(",")}] load:${a.activeTaskCount}`)
      .join("\n");

    const taskList = snapshot.tasks
      .filter(t => t.status !== "done")
      .map(t => {
        const assignees = t.assigneeIds.map(id => {
          const a = snapshot.agents.find(ag => ag.id === id);
          return a ? a.name : id;
        }).join(", ") || "(unassigned)";
        const age = Math.round((Date.now() - t.updatedAt) / 60000);
        return `- [${t.id}] "${t.title}" status:${t.status} priority:${t.priority || "none"} tags:[${t.tags.join(",")}] assignees:[${assignees}] age:${age}min`;
      })
      .join("\n");

    const recentFeed = snapshot.recentActivity
      .slice(0, 15)
      .map(a => `- [${a.type}] ${a.message}`)
      .join("\n");

    const prompt = [
      `You are JARVIS, the coordinator agent for workspace "${ws.slug}".`,
      `Your job is to keep the team productive: triage inbox tasks, detect stuck work, break down large tasks, rebalance load, and create missing tasks.`,
      "",
      "## Agent Roster",
      agentRoster,
      "",
      "## Task Board (non-done)",
      taskList || "(no active tasks)",
      "",
      "## Recent Activity (last 15)",
      recentFeed || "(no recent activity)",
      "",
      "## Your Capabilities",
      "Output structured ACTION lines to take coordination actions. Each action MUST be on its own line.",
      "Available actions:",
      "",
      "  ACTION: ASSIGN | taskId=<id> | agentName=<name>",
      "    Assign an unassigned inbox task to an agent. Picks the best match by tags + lowest load.",
      "",
      "  ACTION: CREATE | title=<title> | description=<desc> | tags=<comma-sep> | priority=<low|medium|high>",
      "    Create a new task. Use for subtask breakdown or identified gaps. Max 3 per heartbeat.",
      "",
      "  ACTION: REASSIGN | taskId=<id> | fromAgentName=<name> | toAgentName=<name>",
      "    Move a stuck/blocked task to a different agent.",
      "",
      "  ACTION: TRIGGER | agentName=<name>",
      "    Wake up an agent immediately (creates a Run Now request).",
      "",
      "  ACTION: STATUS | taskId=<id> | status=<inbox|assigned|in_progress|review|done|blocked>",
      "    Change a task's status (e.g., move blocked tasks back to inbox for re-triage).",
      "",
      "## Rules",
      "1. Triage ALL inbox tasks — match task tags to agent tags, assign to the agent with lowest load.",
      "2. If no tag match, assign to an active LEAD agent.",
      "3. Flag tasks stuck in assigned/in_progress for >30 min with no recent activity.",
      "4. Never assign tasks to yourself (JARVIS).",
      "5. Never reassign tasks that are in review or done.",
      "6. When creating subtasks, include the parent task ID in the tags as 'parent:<taskId>'.",
      "7. Max 8 total actions per heartbeat. Max 3 CREATE actions.",
      "8. After all actions, write a brief coordination summary (2-3 sentences).",
      "",
      "Think step by step about the board state, then output your actions and summary.",
    ].join("\n");

    let response = "";
    try {
      response = runAgent(prompt);
    } catch (err) {
      response = `Coordinator error: ${String(err?.message ?? err)}`;
    }

    // Parse and execute actions
    const actions = parseCoordinatorActions(response);
    const results = await executeCoordinatorActions(client, ws._id, agentId, actions, snapshot);

    // Post coordination summary to activity feed
    const summaryMsg = results.length
      ? `${agentName} executed ${results.length} actions:\n${results.join("\n")}`
      : `${agentName} coordination: no actions taken`;

    await client.mutation(api.activities.create, {
      workspaceId: ws._id,
      type: "coordination",
      agentId,
      message: summaryMsg,
    });

    // Post comments on affected tasks
    const affectedTaskIds = new Set();
    for (const action of actions) {
      if (action.params.taskId) affectedTaskIds.add(action.params.taskId);
    }
    for (const taskId of affectedTaskIds) {
      const relevantResults = results.filter(r => r.includes(taskId));
      if (relevantResults.length === 0) continue;
      try {
        await client.mutation(api.messages.create, {
          workspaceId: ws._id,
          taskId,
          content: `[JARVIS coordination] ${relevantResults.join("; ")}`,
          fromAgentId: agentId,
        });
      } catch {
        // Task may not exist if it was just created; skip
      }
    }

    process.stdout.write(msg + "\n");
    if (results.length) process.stdout.write(results.join("\n") + "\n");
    return;
  }
  // ── End coordinator path ──────────────────────────────────
```

**Step 5: Verify the script parses without errors**

Run: `node -c scripts/agent-heartbeat.mjs`
Expected: No syntax errors.

**Step 6: Commit**

```bash
git add scripts/agent-heartbeat.mjs
git commit -m "feat: add COORD heartbeat path to agent-heartbeat.mjs — triage, reassign, create, trigger"
```

---

## Task 4: Update UI to show COORD level distinctly

**Files:**
- Modify: `src/components/mission-control/MissionControlPage.tsx:218` (AgentCard badge)
- Modify: `src/app/w/[slug]/agents/page.tsx:10,330-335` (type + dropdown)
- Modify: `src/app/globals.css` (badge color for COORD)

**Step 1: Add COORD badge color in globals.css**

After the existing `.mc-badge` rule (~line 446), add:

```css
.mc-badge-coord {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #78350f;
}
```

**Step 2: Apply COORD badge class in AgentCard**

In `MissionControlPage.tsx`, in the `AgentCard` function (~line 218), change:

```tsx
<span className="mc-badge shrink-0">{level}</span>
```

to:

```tsx
<span className={`mc-badge shrink-0${level === "COORD" ? " mc-badge-coord" : ""}`}>{level}</span>
```

**Step 3: Add COORD to AgentLevel type on agents page**

In `src/app/w/[slug]/agents/page.tsx:10`, change:

```ts
type AgentLevel = "LEAD" | "SPC" | "INT";
```

to:

```ts
type AgentLevel = "COORD" | "LEAD" | "SPC" | "INT";
```

**Step 4: Add COORD option to the level dropdown**

In `src/app/w/[slug]/agents/page.tsx`, in the level `<select>` (~line 332), add the COORD option as the first child:

```tsx
<option value="COORD">COORD</option>
<option value="LEAD">LEAD</option>
<option value="SPC">SPC</option>
<option value="INT">INT</option>
```

**Step 5: Verify the dev server builds cleanly**

Run: `npm run build`
Expected: Build succeeds, no type errors.

**Step 6: Commit**

```bash
git add src/components/mission-control/MissionControlPage.tsx src/app/w/[slug]/agents/page.tsx src/app/globals.css
git commit -m "feat: add COORD badge styling and level option in UI"
```

---

## Task 5: Seed JARVIS agent

**Files:**
- Modify: `convex/seed.ts:24-36` (add JARVIS to agentsToEnsure)

**Step 1: Add JARVIS to the agents array**

In `convex/seed.ts`, add as the first entry in `agentsToEnsure` (line 25):

```ts
{ name: "JARVIS", role: "Coordinator", level: "COORD" as const, status: "active" as const },
```

**Step 2: Verify schema accepts COORD level**

Run: `npx convex dev` (let it push, then Ctrl+C)
Expected: No errors.

**Step 3: Create JARVIS in the live workspace via CLI (manual)**

If you don't want to re-seed, create via CLI:

```bash
node scripts/missionctl.mjs agent upsert --workspace mission-control --name JARVIS --role Coordinator --level COORD --status active --tags "coordination,triage,planning"
```

**Step 4: Commit**

```bash
git add convex/seed.ts
git commit -m "feat: add JARVIS coordinator agent to seed data"
```

---

## Task 6: Wire coordinator into dev-runner schedule

The dev-runner (`scripts/dev-runner.mjs`) already polls `runRequests` and spawns heartbeats. JARVIS can be triggered via Run Now. But we also want JARVIS to heartbeat on a 15-min interval automatically during dev.

**Files:**
- Modify: `scripts/dev-runner.mjs` (add coordinator auto-heartbeat)

**Step 1: Read the current dev-runner.mjs to understand the polling loop**

Read: `scripts/dev-runner.mjs`

**Step 2: Add a coordinator heartbeat timer**

Inside the polling loop, add a separate timer that checks if 15 minutes have elapsed since the last coordinator heartbeat. If so, find the COORD agent and spawn a heartbeat for it:

After the existing run-queue polling logic, add:

```js
// ── Coordinator auto-heartbeat (every 15 min) ──
const COORD_INTERVAL = 15 * 60 * 1000; // 15 minutes
let lastCoordRun = 0;

// Inside the poll loop, after processing runRequests:
const now = Date.now();
if (now - lastCoordRun >= COORD_INTERVAL) {
  const allAgents = await client.query(api.agents.list, { workspaceId: ws._id });
  const coord = allAgents.find(a => a.level === "COORD" && a.status === "active");
  if (coord) {
    console.log(`[coord] Triggering JARVIS heartbeat (${coord._id})`);
    spawnHeartbeat(ws.slug, coord._id);
    lastCoordRun = now;
  }
}
```

(Exact integration depends on the current structure of dev-runner.mjs — adapt the `spawnHeartbeat` call to match the existing pattern.)

**Step 3: Verify dev-runner starts cleanly**

Run: `npm run dev` and check logs for coordinator heartbeat trigger.

**Step 4: Commit**

```bash
git add scripts/dev-runner.mjs
git commit -m "feat: auto-trigger JARVIS coordinator heartbeat every 15 min in dev-runner"
```

---

## Task 7: Update auto-assign to skip COORD agents

The existing auto-assign in `tasks.updateStatus` picks a LEAD when a task moves to "assigned" with no assignees. JARVIS should never be auto-assigned work.

**Files:**
- Modify: `convex/tasks.ts:155-175` (auto-assign filter)

**Step 1: Filter out COORD agents from auto-assignment**

In `convex/tasks.ts`, in the `updateStatus` handler, change the auto-assign block (~line 161):

```ts
const active = agents.filter((a) => a.status === "active");
```

to:

```ts
const active = agents.filter((a) => a.status === "active" && a.level !== "COORD");
```

**Step 2: Also filter COORD from claimUnassigned**

In `convex/tasks.ts`, in the `claimUnassigned` handler, the agent is passed by ID so it already only claims for itself. But as a safety measure, add at the top of the handler (~line 290, after fetching agent):

```ts
if (agent.level === "COORD") return null; // Coordinators don't claim tasks
```

**Step 3: Verify Convex pushes cleanly**

Run: `npx convex dev` (push, then Ctrl+C)
Expected: No errors.

**Step 4: Commit**

```bash
git add convex/tasks.ts
git commit -m "fix: exclude COORD agents from auto-assignment and task claiming"
```

---

## Task 8: Update documentation

**Files:**
- Modify: `docs/AGENTS.md`
- Modify: `CLAUDE.md`

**Step 1: Add JARVIS coordinator section to AGENTS.md**

Add a new section after "### 3) Heartbeats":

```markdown
### 5) JARVIS Coordinator

JARVIS is the coordinator agent (level: `COORD`). One per workspace. It runs on a 15-minute heartbeat and:

- **Triages inbox**: Assigns unassigned tasks by matching task tags to agent tags, preferring the agent with the lowest active task count.
- **Monitors stuck work**: Detects tasks stuck in assigned/in_progress for >30 min, reassigns if needed.
- **Breaks down tasks**: Decomposes large tasks into subtasks tagged with `parent:<taskId>`.
- **Creates tasks**: Identifies gaps and creates new tasks proactively (max 3 per heartbeat).
- **Rebalances load**: Redistributes work from overloaded agents to idle ones.
- **Auto-triggers agents**: After assigning a task, creates a `runRequest` so the agent wakes immediately.

Coordinator actions are visible in the activity feed (type: `coordination`) and as comments on affected tasks.

The coordinator heartbeat is a code path in `scripts/agent-heartbeat.mjs` that activates when `agent.level === "COORD"`. It fetches a full board snapshot via `convex/coordinator.ts:boardSnapshot`, sends a structured prompt to Claude, and parses `ACTION:` lines from the response.

**Safety limits:**
- Max 8 actions per heartbeat
- Max 3 task creations per heartbeat
- COORD agents are excluded from auto-assignment and task claiming
```

**Step 2: Update CLAUDE.md data model section**

In `CLAUDE.md`, in the agents bullet under "## Data Model", add `COORD` to the level list:

```
- **agents**: name, role, level (COORD/LEAD/SPC/INT), status (idle/active/blocked), prompt, systemNotes, sessionKey
```

**Step 3: Commit**

```bash
git add docs/AGENTS.md CLAUDE.md
git commit -m "docs: add JARVIS coordinator documentation"
```

---

## Task 9: Manual integration test

**Step 1: Start the dev environment**

```bash
npm run dev
# In another terminal:
npx convex dev
```

**Step 2: Create JARVIS via the agents UI**

Navigate to `http://localhost:3000/w/mission-control/agents`, click "+ New", fill in:
- Name: JARVIS
- Role: Coordinator
- Level: COORD
- Status: active
- Tags: coordination, triage, planning

Save. Verify the gold COORD badge appears.

**Step 3: Create a test inbox task**

On the dashboard, click "+ New Task", create:
- Title: "Test coordinator triage"
- Tags: frontend
- Leave unassigned in inbox

**Step 4: Trigger JARVIS manually**

On the agents page, select JARVIS, click "Run Now".

**Step 5: Verify coordination happened**

Check the activity feed for:
- A `coordination` entry from JARVIS showing the board scan
- A `coordination` entry showing actions executed
- The test task should be assigned to an agent with matching `frontend` tag
- A comment on the test task from JARVIS explaining the assignment

**Step 6: Verify the assigned agent was triggered**

Check `runRequests` in Convex dashboard — there should be a pending request for the agent JARVIS assigned the task to.

---

## Summary of All Changes

| File | Change |
|---|---|
| `convex/schema.ts` | Add `COORD` to agent level union |
| `convex/agents.ts` | Add `COORD` to upsert validator |
| `convex/coordinator.ts` | New file — `boardSnapshot` query |
| `convex/tasks.ts` | Exclude COORD from auto-assign + claimUnassigned |
| `convex/seed.ts` | Add JARVIS to seed agents |
| `scripts/agent-heartbeat.mjs` | Add COORD branch: snapshot fetch, coordinator prompt, action parser, action executor |
| `scripts/dev-runner.mjs` | Add 15-min coordinator auto-heartbeat timer |
| `src/components/mission-control/MissionControlPage.tsx` | COORD badge class on AgentCard |
| `src/app/w/[slug]/agents/page.tsx` | Add COORD to level type + dropdown |
| `src/app/globals.css` | Gold badge style for `.mc-badge-coord` |
| `docs/AGENTS.md` | Document JARVIS coordinator |
| `CLAUDE.md` | Update agent level list |
