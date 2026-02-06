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
