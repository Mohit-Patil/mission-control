import { mutation } from "./_generated/server";

export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Idempotent-ish: if agents exist, don't reseed.
    const existingAgents = await ctx.db.query("agents").collect();
    if (existingAgents.length > 0) {
      return { ok: true, skipped: true, agents: existingAgents.length };
    }

    const agents = [
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

    const agentIds: { name: string; id: string }[] = [];
    for (const a of agents) {
      const id = await ctx.db.insert("agents", {
        ...a,
        createdAt: now,
        updatedAt: now,
      });
      agentIds.push({ name: a.name, id });
    }

    const tasks = [
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
    ];

    const nameToId = new Map(agentIds.map((x) => [x.name, x.id]));

    for (const t of tasks) {
      const assigneeIds = t.assignees.map((n) => nameToId.get(n)).filter(Boolean);
      await ctx.db.insert("tasks", {
        title: t.title,
        description: t.description,
        status: t.status,
        assigneeIds,
        tags: t.tags,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("activities", {
      type: "seed",
      message: "Seeded Mission Control with starter agents + tasks",
      createdAt: now,
    });

    return { ok: true, skipped: false, agents: agentIds.length, tasks: tasks.length };
  },
});
