import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function truncate(s: string, n: number) {
  const trimmed = s.trim();
  if (trimmed.length <= n) return trimmed;
  return trimmed.slice(0, n - 1) + "…";
}

export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: {
    taskId: v.id("tasks"),
    content: v.string(),
    fromAgentId: v.optional(v.id("agents")),
    fromHuman: v.optional(v.boolean()),
    actorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const content = args.content.trim();
    if (!content) throw new Error("Message content cannot be empty");

    await ctx.db.insert("messages", {
      taskId: args.taskId,
      fromAgentId: args.fromAgentId,
      fromHuman: args.fromHuman,
      content,
      attachments: [],
      createdAt: now,
    });

    const task = await ctx.db.get(args.taskId);
    const agent = args.fromAgentId ? await ctx.db.get(args.fromAgentId) : null;

    const actor = agent?.name ?? (args.fromHuman ? args.actorName ?? "Human" : "System");
    const taskTitle = task?.title ?? "(unknown task)";

    await ctx.db.insert("activities", {
      type: "comment",
      agentId: agent?._id,
      message: `${actor} commented on “${taskTitle}”: ${truncate(content, 120)}`,
      createdAt: now,
    });
  },
});
