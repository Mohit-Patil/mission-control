import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_workspace_name", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const getById = query({
  args: {
    workspaceId: v.id("workspaces"),
    id: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.id);
    if (!agent || agent.workspaceId !== args.workspaceId) return null;
    return agent;
  },
});

export const upsert = mutation({
  args: {
    workspaceId: v.id("workspaces"),

    id: v.optional(v.id("agents")),
    name: v.string(),
    role: v.string(),
    level: v.union(v.literal("LEAD"), v.literal("SPC"), v.literal("INT")),
    status: v.union(v.literal("idle"), v.literal("active"), v.literal("blocked")),
    currentTaskId: v.optional(v.id("tasks")),
    sessionKey: v.optional(v.string()),
    prompt: v.optional(v.string()),
    systemNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Agent not found");
      if (existing.workspaceId !== args.workspaceId) throw new Error("Wrong workspace");

      await ctx.db.patch(args.id, {
        name: args.name,
        role: args.role,
        level: args.level,
        status: args.status,
        currentTaskId: args.currentTaskId,
        sessionKey: args.sessionKey,
        prompt: args.prompt,
        systemNotes: args.systemNotes,
        updatedAt: now,
      });
      return args.id;
    }

    return await ctx.db.insert("agents", {
      workspaceId: args.workspaceId,
      name: args.name,
      role: args.role,
      level: args.level,
      status: args.status,
      currentTaskId: args.currentTaskId,
      sessionKey: args.sessionKey,
      prompt: args.prompt,
      systemNotes: args.systemNotes,
      createdAt: now,
      updatedAt: now,
    });
  },
});
