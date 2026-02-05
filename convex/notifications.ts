import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const forAgent = query({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
    undeliveredOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(200, Math.max(1, args.limit ?? 50));
    const undeliveredOnly = args.undeliveredOnly ?? true;

    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_agent", (q) => q.eq("mentionedAgentId", args.agentId))
      .collect();

    const filtered = undeliveredOnly ? rows.filter((n) => !n.delivered) : rows;
    return filtered.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  },
});

export const totalUndelivered = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_delivered", (q) => q.eq("delivered", false))
      .collect();
    return rows.length;
  },
});

export const markDelivered = mutation({
  args: {
    id: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { delivered: true });
  },
});
