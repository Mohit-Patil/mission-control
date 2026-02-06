import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

export const listByStatus = query({
  args: {
    workspaceId: v.id("workspaces"),
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
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", args.status)
      )
      .order("desc")
      .collect();
  },
});

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
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
    assigneeId: v.optional(v.id("agents")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(1000, Math.max(1, args.limit ?? 200));

    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_workspace_updated", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(limit);

    return rows.filter((t) => {
      if (args.status && t.status !== args.status) return false;
      if (args.assigneeId && !(t.assigneeIds ?? []).includes(args.assigneeId)) return false;
      return true;
    });
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
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
      workspaceId: args.workspaceId,
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
      workspaceId: args.workspaceId,
      type: "task_created",
      message: `Task created: ${args.title}`,
      createdAt: now,
    });

    return id;
  },
});

export const updateStatus = mutation({
  args: {
    workspaceId: v.id("workspaces"),
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

    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    if (task.workspaceId !== args.workspaceId) throw new Error("Wrong workspace");

    await ctx.db.patch(args.id, { status: args.status, updatedAt: now });

    const agent = args.fromAgentId ? await ctx.db.get(args.fromAgentId) : null;
    if (agent && agent.workspaceId !== args.workspaceId) throw new Error("Wrong workspace");

    const actor = agent?.name ?? (args.fromHuman ? args.actorName ?? "Human" : "System");

    await ctx.db.insert("activities", {
      workspaceId: args.workspaceId,
      type: "task_status",
      agentId: agent?._id,
      message: `${actor} moved “${task?.title ?? "(unknown task)"}” to ${args.status}`,
      createdAt: now,
    });

    // Auto-assign: when moved to Assigned with no assignees, pick an active LEAD.
    if (args.status === "assigned" && (task.assigneeIds ?? []).length === 0) {
      const agents = await ctx.db
        .query("agents")
        .withIndex("by_workspace_name", (q) => q.eq("workspaceId", args.workspaceId))
        .collect();

      const active = agents.filter((a) => a.status === "active");
      const lead = active.find((a) => a.level === "LEAD");
      const pick = lead ?? active[0];

      if (pick) {
        await setAssigneesCore(ctx, {
          workspaceId: args.workspaceId,
          id: args.id,
          assigneeIds: [pick._id],
          fromAgentId: args.fromAgentId,
          fromHuman: args.fromHuman,
          actorName: args.actorName,
        });
      }
    }
  },
});

async function setAssigneesCore(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
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
  if (task.workspaceId !== args.workspaceId) throw new Error("Wrong workspace");

  let nextStatus = task.status;
  if (task.status === "inbox" && args.assigneeIds.length > 0) {
    nextStatus = "assigned";
  }

  await ctx.db.patch(args.id, {
    assigneeIds: args.assigneeIds,
    status: nextStatus,
    updatedAt: now,
  });

  const agent = args.fromAgentId ? await ctx.db.get(args.fromAgentId) : null;
  if (agent && agent.workspaceId !== args.workspaceId) throw new Error("Wrong workspace");

  const actor = agent?.name ?? (args.fromHuman ? args.actorName ?? "Human" : "System");

  const assignees = await Promise.all(args.assigneeIds.map((aid) => ctx.db.get(aid)));
  const names = assignees
    .filter((a): a is NonNullable<typeof a> => !!a)
    .filter((a) => a.workspaceId === args.workspaceId)
    .map((a) => a.name)
    .sort();

  const who = names.length ? names.join(", ") : "(no one)";

  await ctx.db.insert("activities", {
    workspaceId: args.workspaceId,
    type: "task_assignees",
    agentId: agent?._id,
    message: `${actor} set assignees for “${task.title}” to ${who}`,
    createdAt: now,
  });

  if (task.status === "inbox" && args.assigneeIds.length > 0) {
    await ctx.db.insert("activities", {
      workspaceId: args.workspaceId,
      type: "task_status",
      agentId: agent?._id,
      message: `${actor} moved “${task.title}” to assigned`,
      createdAt: now,
    });
  }
}

export const setAssignees = mutation({
  args: {
    workspaceId: v.id("workspaces"),
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
    workspaceId: v.id("workspaces"),
    id: v.id("tasks"),
    agentId: v.id("agents"),
    fromAgentId: v.optional(v.id("agents")),
    fromHuman: v.optional(v.boolean()),
    actorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    if (task.workspaceId !== args.workspaceId) throw new Error("Wrong workspace");

    const next = Array.from(new Set([...(task.assigneeIds ?? []), args.agentId]));
    await setAssigneesCore(ctx, {
      workspaceId: args.workspaceId,
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
    workspaceId: v.id("workspaces"),
    id: v.id("tasks"),
    agentId: v.id("agents"),
    fromAgentId: v.optional(v.id("agents")),
    fromHuman: v.optional(v.boolean()),
    actorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    if (task.workspaceId !== args.workspaceId) throw new Error("Wrong workspace");

    const next = (task.assigneeIds ?? []).filter((x) => x !== args.agentId);
    await setAssigneesCore(ctx, {
      workspaceId: args.workspaceId,
      id: args.id,
      assigneeIds: next,
      fromAgentId: args.fromAgentId,
      fromHuman: args.fromHuman,
      actorName: args.actorName,
    });
  },
});
