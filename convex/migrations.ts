import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const moveWorkspaceData = mutation({
  args: {
    fromSlug: v.string(),
    toSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const from = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.fromSlug))
      .unique();
    const to = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.toSlug))
      .unique();

    if (!from || !to) {
      throw new Error(`Workspace not found: from=${args.fromSlug} to=${args.toSlug}`);
    }

    const now = Date.now();
    const patched = {
      agents: 0,
      tasks: 0,
      messages: 0,
      activities: 0,
      documents: 0,
      notifications: 0,
    };

    // Important: order matters because tasks reference agents and messages reference tasks.

    // Agents
    for (const a of await ctx.db.query("agents").withIndex("by_workspace_name", (q) => q.eq("workspaceId", from._id)).collect()) {
      await ctx.db.patch(a._id, { workspaceId: to._id, updatedAt: now });
      patched.agents++;
    }

    // Tasks
    for (const t of await ctx.db.query("tasks").withIndex("by_workspace_updated", (q) => q.eq("workspaceId", from._id)).collect()) {
      await ctx.db.patch(t._id, { workspaceId: to._id, updatedAt: now });
      patched.tasks++;
    }

    // Messages
    for (const m of await ctx.db.query("messages").withIndex("by_workspace_task", (q) => q.eq("workspaceId", from._id)).collect()) {
      await ctx.db.patch(m._id, { workspaceId: to._id });
      patched.messages++;
    }

    // Activities
    for (const act of await ctx.db.query("activities").withIndex("by_workspace_created", (q) => q.eq("workspaceId", from._id)).collect()) {
      await ctx.db.patch(act._id, { workspaceId: to._id });
      patched.activities++;
    }

    // Documents
    for (const d of await ctx.db.query("documents").withIndex("by_workspace_task", (q) => q.eq("workspaceId", from._id)).collect()) {
      await ctx.db.patch(d._id, { workspaceId: to._id, updatedAt: now });
      patched.documents++;
    }

    // Notifications
    for (const n of await ctx.db.query("notifications").withIndex("by_workspace_delivered", (q) => q.eq("workspaceId", from._id)).collect()) {
      await ctx.db.patch(n._id, { workspaceId: to._id });
      patched.notifications++;
    }

    await ctx.db.insert("activities", {
      workspaceId: to._id,
      type: "migration",
      message: `Moved data from workspace ${args.fromSlug} → ${args.toSlug}`,
      createdAt: now,
    });

    return { ok: true, from: from.slug, to: to.slug, patched };
  },
});
