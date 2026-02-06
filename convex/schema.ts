import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Mission Control schema (modeled after the reference screenshots / thread)
 */
export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_updated", ["updatedAt"]),

  agents: defineTable({
    // Temporarily optional to allow migration of legacy rows.
    workspaceId: v.optional(v.id("workspaces")),

    name: v.string(),
    role: v.string(),
    level: v.union(v.literal("COORD"), v.literal("LEAD"), v.literal("SPC"), v.literal("INT")),
    status: v.union(v.literal("idle"), v.literal("active"), v.literal("blocked")),
    currentTaskId: v.optional(v.id("tasks")),
    sessionKey: v.optional(v.string()),

    // Specialty tags for auto-routing (e.g. ["frontend", "ui", "react"])
    tags: v.optional(v.array(v.string())),

    // Freeform prompt / notes for human operators.
    prompt: v.optional(v.string()),
    systemNotes: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_name", ["workspaceId", "name"]),

  tasks: defineTable({
    // Temporarily optional to allow migration of legacy rows.
    workspaceId: v.optional(v.id("workspaces")),

    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("done")
    ),
    assigneeIds: v.array(v.id("agents")),
    tags: v.array(v.string()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_updated", ["workspaceId", "updatedAt"])
    .index("by_workspace_title", ["workspaceId", "title"]),

  messages: defineTable({
    // Temporarily optional to allow migration of legacy rows.
    workspaceId: v.optional(v.id("workspaces")),

    taskId: v.id("tasks"),
    fromAgentId: v.optional(v.id("agents")),
    fromHuman: v.optional(v.boolean()),
    content: v.string(),
    attachments: v.array(v.id("documents")),
    createdAt: v.number(),
  }).index("by_workspace_task", ["workspaceId", "taskId"]),

  activities: defineTable({
    // Temporarily optional to allow migration of legacy rows.
    workspaceId: v.optional(v.id("workspaces")),

    type: v.string(),
    agentId: v.optional(v.id("agents")),
    message: v.string(),
    createdAt: v.number(),
  }).index("by_workspace_created", ["workspaceId", "createdAt"]),

  documents: defineTable({
    // Temporarily optional to allow migration of legacy rows.
    workspaceId: v.optional(v.id("workspaces")),

    title: v.string(),
    content: v.string(),
    type: v.union(
      v.literal("deliverable"),
      v.literal("research"),
      v.literal("protocol"),
      v.literal("note")
    ),
    taskId: v.optional(v.id("tasks")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace_task", ["workspaceId", "taskId"]),

  notifications: defineTable({
    // Temporarily optional to allow migration of legacy rows.
    workspaceId: v.optional(v.id("workspaces")),

    mentionedAgentId: v.id("agents"),
    content: v.string(),
    delivered: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_workspace_delivered", ["workspaceId", "delivered"])
    .index("by_workspace_agent", ["workspaceId", "mentionedAgentId"]),

  runRequests: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    agentId: v.id("agents"),
    status: v.union(v.literal("pending"), v.literal("done"), v.literal("failed")),
    note: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_agent", ["workspaceId", "agentId"]),
});
