import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("runRequests", {
      workspaceId: args.workspaceId,
      agentId: args.agentId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listPending = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    let q = ctx.db.query("runRequests").withIndex("by_status", (q) => q.eq("status", "pending"));
    if (args.workspaceId) {
      q = ctx.db
        .query("runRequests")
        .withIndex("by_workspace_status", (q) =>
          q.eq("workspaceId", args.workspaceId!).eq("status", "pending")
        );
    }
    return await q.order("asc").take(limit);
  },
});

export const listForAgent = query({
  args: {
    workspaceId: v.id("workspaces"),
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 5;
    return await ctx.db
      .query("runRequests")
      .withIndex("by_workspace_agent", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("agentId", args.agentId)
      )
      .order("desc")
      .take(limit);
  },
});

export const markDone = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    id: v.id("runRequests"),
    status: v.union(v.literal("done"), v.literal("failed")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Run request not found");
    if (args.workspaceId && existing.workspaceId !== args.workspaceId) {
      throw new Error("Wrong workspace");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      note: args.note,
      updatedAt: Date.now(),
    });
  },
});

export const clearPending = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("runRequests")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "pending")
      )
      .collect();

    for (const r of pending) {
      await ctx.db.patch(r._id, {
        status: "done",
        note: "cleared",
        updatedAt: Date.now(),
      });
    }

    return { cleared: pending.length };
  },
});
