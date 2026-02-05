import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

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

    // Mentions → notifications (@AgentName, @all)
    const allAgents = await ctx.db.query("agents").collect();

    const mentionedIds = new Set<Id<"agents">>();
    const mentionAll = /@all\b/i.test(content);

    if (mentionAll) {
      for (const a of allAgents) mentionedIds.add(a._id);
    } else {
      const re = /@([a-z0-9_-]+)/gi;
      for (const m of content.matchAll(re)) {
        const name = (m[1] ?? "").trim();
        if (!name) continue;
        const found = allAgents.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (found) mentionedIds.add(found._id);
      }
    }

    for (const mentionedAgentId of mentionedIds) {
      await ctx.db.insert("notifications", {
        mentionedAgentId,
        content: `${actor} mentioned you on “${taskTitle}”: ${truncate(content, 200)}`,
        delivered: false,
        createdAt: now,
      });
    }
  },
});
