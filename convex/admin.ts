import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Delete all tasks + agents in a workspace (by slug), including related data.
export const clearTasksAndAgents = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const ws = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!ws) throw new Error(`Workspace not found: ${args.slug}`);

    let tasks = 0;
    let agents = 0;
    let messages = 0;
    let documents = 0;
    let notifications = 0;
    let runRequests = 0;

    // Delete messages (depend on tasks)
    for (const m of await ctx.db
      .query("messages")
      .withIndex("by_workspace_task", (q) => q.eq("workspaceId", ws._id))
      .collect()) {
      await ctx.db.delete(m._id);
      messages++;
    }

    // Delete documents (depend on tasks)
    for (const d of await ctx.db
      .query("documents")
      .withIndex("by_workspace_task", (q) => q.eq("workspaceId", ws._id))
      .collect()) {
      await ctx.db.delete(d._id);
      documents++;
    }

    // Delete tasks
    for (const t of await ctx.db
      .query("tasks")
      .withIndex("by_workspace_updated", (q) => q.eq("workspaceId", ws._id))
      .collect()) {
      await ctx.db.delete(t._id);
      tasks++;
    }

    // Delete notifications (depend on agents)
    for (const n of await ctx.db
      .query("notifications")
      .withIndex("by_workspace_delivered", (q) => q.eq("workspaceId", ws._id))
      .collect()) {
      await ctx.db.delete(n._id);
      notifications++;
    }

    // Delete run requests (depend on agents)
    for (const r of await ctx.db
      .query("runRequests")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ws._id))
      .collect()) {
      await ctx.db.delete(r._id);
      runRequests++;
    }

    // Delete agents
    for (const a of await ctx.db
      .query("agents")
      .withIndex("by_workspace_name", (q) => q.eq("workspaceId", ws._id))
      .collect()) {
      await ctx.db.delete(a._id);
      agents++;
    }

    return { ok: true, workspace: ws.slug, tasks, agents, messages, documents, notifications, runRequests };
  },
});

export const normalizeAssignedTasks = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const ws = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!ws) throw new Error(`Workspace not found: ${args.slug}`);

    let updated = 0;
    for (const t of await ctx.db
      .query("tasks")
      .withIndex("by_workspace_updated", (q) => q.eq("workspaceId", ws._id))
      .collect()) {
      if (t.status === "inbox" && (t.assigneeIds ?? []).length > 0) {
        await ctx.db.patch(t._id, { status: "assigned", updatedAt: Date.now() });
        updated++;
      }
    }

    return { ok: true, workspace: ws.slug, updated };
  },
});
