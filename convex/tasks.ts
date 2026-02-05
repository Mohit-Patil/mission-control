import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("done"),
      v.literal("blocked")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    status: v.optional(
      v.union(
        v.literal("inbox"),
        v.literal("assigned"),
        v.literal("in_progress"),
        v.literal("review"),
        v.literal("done"),
        v.literal("blocked")
      )
    ),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      status: args.status ?? "inbox",
      assigneeIds: [],
      tags: args.tags ?? [],
      priority: args.priority,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("activities", {
      type: "task_created",
      message: `Task created: ${args.title}`,
      createdAt: now,
    });

    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("done"),
      v.literal("blocked")
    ),
    fromAgentId: v.optional(v.id("agents")),
    fromHuman: v.optional(v.boolean()),
    actorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, { status: args.status, updatedAt: now });

    const task = await ctx.db.get(args.id);
    const agent = args.fromAgentId ? await ctx.db.get(args.fromAgentId) : null;
    const actor = agent?.name ?? (args.fromHuman ? args.actorName ?? "Human" : "System");

    await ctx.db.insert("activities", {
      type: "task_status",
      agentId: agent?._id,
      message: `${actor} moved “${task?.title ?? "(unknown task)"}” to ${args.status}`,
      createdAt: now,
    });
  },
});

async function setAssigneesCore(
  ctx: MutationCtx,
  args: {
    id: Id<"tasks">;
    assigneeIds: Id<"agents">[];
    fromAgentId?: Id<"agents">;
    fromHuman?: boolean;
    actorName?: string;
  }
) {
  const now = Date.now();

  const task = await ctx.db.get(args.id);
  if (!task) throw new Error("Task not found");

  await ctx.db.patch(args.id, {
    assigneeIds: args.assigneeIds,
    updatedAt: now,
  });

  const agent = args.fromAgentId ? await ctx.db.get(args.fromAgentId) : null;
  const actor = agent?.name ?? (args.fromHuman ? args.actorName ?? "Human" : "System");

  const assignees = await Promise.all(args.assigneeIds.map((aid) => ctx.db.get(aid)));
  const names = assignees
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => a.name)
    .sort();

  const who = names.length ? names.join(", ") : "(no one)";

  await ctx.db.insert("activities", {
    type: "task_assignees",
    agentId: agent?._id,
    message: `${actor} set assignees for “${task.title}” to ${who}`,
    createdAt: now,
  });
}

export const setAssignees = mutation({
  args: {
    id: v.id("tasks"),
    assigneeIds: v.array(v.id("agents")),
    fromAgentId: v.optional(v.id("agents")),
    fromHuman: v.optional(v.boolean()),
    actorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await setAssigneesCore(ctx, args);
  },
});

export const assign = mutation({
  args: {
    id: v.id("tasks"),
    agentId: v.id("agents"),
    fromAgentId: v.optional(v.id("agents")),
    fromHuman: v.optional(v.boolean()),
    actorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    const next = Array.from(new Set([...(task.assigneeIds ?? []), args.agentId]));
    await setAssigneesCore(ctx, {
      id: args.id,
      assigneeIds: next,
      fromAgentId: args.fromAgentId,
      fromHuman: args.fromHuman,
      actorName: args.actorName,
    });
  },
});

export const unassign = mutation({
  args: {
    id: v.id("tasks"),
    agentId: v.id("agents"),
    fromAgentId: v.optional(v.id("agents")),
    fromHuman: v.optional(v.boolean()),
    actorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    const next = (task.assigneeIds ?? []).filter((x) => x !== args.agentId);
    await setAssigneesCore(ctx, {
      id: args.id,
      assigneeIds: next,
      fromAgentId: args.fromAgentId,
      fromHuman: args.fromHuman,
      actorName: args.actorName,
    });
  },
});
