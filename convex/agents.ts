import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agents").collect();
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("agents")),
    name: v.string(),
    role: v.string(),
    level: v.union(v.literal("LEAD"), v.literal("SPC"), v.literal("INT")),
    status: v.union(v.literal("idle"), v.literal("active"), v.literal("blocked")),
    currentTaskId: v.optional(v.id("tasks")),
    sessionKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.id) {
      await ctx.db.patch(args.id, {
        name: args.name,
        role: args.role,
        level: args.level,
        status: args.status,
        currentTaskId: args.currentTaskId,
        sessionKey: args.sessionKey,
        updatedAt: now,
      });
      return args.id;
    }
    return await ctx.db.insert("agents", {
      name: args.name,
      role: args.role,
      level: args.level,
      status: args.status,
      currentTaskId: args.currentTaskId,
      sessionKey: args.sessionKey,
      createdAt: now,
      updatedAt: now,
    });
  },
});
