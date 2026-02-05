import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";

export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Ensure a default workspace (idempotent)
    const existingWs = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", "default"))
      .unique();

    const workspaceId: Id<"workspaces"> =
      existingWs?._id ??
      (await ctx.db.insert("workspaces", {
        name: "Default",
        slug: "default",
        createdAt: now,
        updatedAt: now,
      }));

    const agentsToEnsure = [
      { name: "Mohit", role: "Founder", level: "LEAD" as const, status: "active" as const },
      { name: "Morty", role: "Squad Lead", level: "LEAD" as const, status: "active" as const },
      { name: "Friday", role: "Developer Agent", level: "SPC" as const, status: "active" as const },
      { name: "Fury", role: "Customer Research", level: "SPC" as const, status: "active" as const },
      { name: "Loki", role: "Content Writer", level: "SPC" as const, status: "active" as const },
      { name: "Vision", role: "SEO Analyst", level: "SPC" as const, status: "active" as const },
      { name: "Wanda", role: "Designer", level: "SPC" as const, status: "active" as const },
      { name: "Pepper", role: "Email Marketing", level: "SPC" as const, status: "active" as const },
      { name: "Quill", role: "Social Media", level: "SPC" as const, status: "active" as const },
      { name: "Shuri", role: "Product Analyst", level: "SPC" as const, status: "active" as const },
      { name: "Wong", role: "Documentation", level: "SPC" as const, status: "active" as const },
    ];

    const nameToId = new Map<string, Id<"agents">>();

    for (const a of agentsToEnsure) {
      const existing = await ctx.db
        .query("agents")
        .withIndex("by_workspace_name", (q) => q.eq("workspaceId", workspaceId).eq("name", a.name))
        .unique();

      if (existing) {
        nameToId.set(a.name, existing._id);
        continue;
      }

      const id = await ctx.db.insert("agents", {
        workspaceId,
        ...a,
        createdAt: now,
        updatedAt: now,
      });
      nameToId.set(a.name, id);
    }

    const tasksToEnsure = [
      {
        title: "Mission Control: wire UI to Convex",
        description: "Replace mock data with realtime Convex queries + mutations.",
        status: "in_progress" as const,
        tags: ["internal", "tooling", "ui"],
        assignees: ["Friday"],
      },
      {
        title: "Add task drawer + comments thread",
        description: "Click a task to open a right-side drawer with messages + docs.",
        status: "assigned" as const,
        tags: ["ui", "ux"],
        assignees: ["Morty"],
      },
      {
        title: "Define agent heartbeats + routing",
        description: "Stagger cron/heartbeats and sync status back to Mission Control.",
        status: "inbox" as const,
        tags: ["agents", "cron"],
        assignees: ["Morty"],
      },
      {
        title: "Draft onboarding email sequence",
        description: "Write a 5-email onboarding sequence for new trial users.",
        status: "inbox" as const,
        tags: ["email", "growth"],
        assignees: ["Pepper"],
      },
      {
        title: "Audit landing page SEO",
        description: "Check titles, meta descriptions, schema, and internal links.",
        status: "assigned" as const,
        tags: ["seo"],
        assignees: ["Vision"],
      },
      {
        title: "Collect top 10 customer objections",
        description: "Summarize objections from calls and support tickets.",
        status: "in_progress" as const,
        tags: ["research", "sales"],
        assignees: ["Fury"],
      },
    ];

    const titleToId = new Map<string, Id<"tasks">>();

    for (const t of tasksToEnsure) {
      const existing = await ctx.db
        .query("tasks")
        .withIndex("by_workspace_title", (q) => q.eq("workspaceId", workspaceId).eq("title", t.title))
        .unique();

      if (existing) {
        titleToId.set(t.title, existing._id);
        continue;
      }

      const assigneeIds = t.assignees
        .map((n) => nameToId.get(n))
        .filter((x): x is Id<"agents"> => x !== undefined);
      const id = await ctx.db.insert("tasks", {
        workspaceId,
        title: t.title,
        description: t.description,
        status: t.status,
        assigneeIds,
        tags: t.tags,
        createdAt: now,
        updatedAt: now,
      });
      titleToId.set(t.title, id);
    }

    // Seed a couple of message threads (idempotent per task: only seed if empty)
    const seedThreads: Array<{
      taskTitle: string;
      messages: Array<{ from: "human" | "agent"; agent?: string; content: string }>;
    }> = [
      {
        taskTitle: "Add task drawer + comments thread",
        messages: [
          { from: "human", content: "Let’s keep the drawer minimal: details + comments first." },
          {
            from: "agent",
            agent: "Morty",
            content: "On it — will wire messages to Convex and keep styling consistent.",
          },
        ],
      },
      {
        taskTitle: "Mission Control: wire UI to Convex",
        messages: [
          { from: "agent", agent: "Friday", content: "Swapping remaining mock UI flows to Convex-first mutations." },
          { from: "human", content: "Priority: task creation, status moves, and clean activity feed events." },
        ],
      },
    ];

    for (const thread of seedThreads) {
      const taskId = titleToId.get(thread.taskTitle);
      if (!taskId) continue;

      const existing = await ctx.db
        .query("messages")
        .withIndex("by_workspace_task", (q) => q.eq("workspaceId", workspaceId).eq("taskId", taskId))
        .take(1);

      if (existing.length > 0) continue;

      for (const m of thread.messages) {
        const fromAgentId = m.from === "agent" && m.agent ? nameToId.get(m.agent) : undefined;
        await ctx.db.insert("messages", {
          workspaceId,
          taskId,
          fromAgentId,
          fromHuman: m.from === "human" ? true : undefined,
          content: m.content,
          attachments: [],
          createdAt: now,
        });
      }
    }

    const seeded = await ctx.db
      .query("activities")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
      .filter((q) => q.eq(q.field("type"), "seed_v3"))
      .take(1);

    if (seeded.length === 0) {
      await ctx.db.insert("activities", {
        workspaceId,
        type: "seed_v3",
        message: "Seeded Mission Control workspace with agents, tasks, and starter threads",
        createdAt: now,
      });
    }

    const agentsCount = (
      await ctx.db
        .query("agents")
        .withIndex("by_workspace_name", (q) => q.eq("workspaceId", workspaceId))
        .collect()
    ).length;
    const tasksCount = (
      await ctx.db
        .query("tasks")
        .withIndex("by_workspace_updated", (q) => q.eq("workspaceId", workspaceId))
        .collect()
    ).length;

    return { ok: true, workspaceId, agents: agentsCount, tasks: tasksCount };
  },
});
