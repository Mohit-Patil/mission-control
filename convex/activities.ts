import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    type: v.string(),
    message: v.string(),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("activities", {
      workspaceId: args.workspaceId,
      type: args.type,
      message: args.message,
      agentId: args.agentId,
      createdAt: Date.now(),
    });
  },
});
