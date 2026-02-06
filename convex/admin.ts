import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Delete all tasks + agents in a workspace (by slug).
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

    for (const t of await ctx.db
      .query("tasks")
      .withIndex("by_workspace_updated", (q) => q.eq("workspaceId", ws._id))
      .collect()) {
      await ctx.db.delete(t._id);
      tasks++;
    }

    for (const a of await ctx.db
      .query("agents")
      .withIndex("by_workspace_name", (q) => q.eq("workspaceId", ws._id))
      .collect()) {
      await ctx.db.delete(a._id);
      agents++;
    }

    return { ok: true, workspace: ws.slug, tasks, agents };
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
