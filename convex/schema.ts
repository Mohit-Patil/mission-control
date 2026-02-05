import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Mission Control schema (modeled after the reference screenshots / thread)
 */
export default defineSchema({
  agents: defineTable({
    name: v.string(),
    role: v.string(),
    level: v.union(v.literal("LEAD"), v.literal("SPC"), v.literal("INT")),
    status: v.union(v.literal("idle"), v.literal("active"), v.literal("blocked")),
    currentTaskId: v.optional(v.id("tasks")),
    sessionKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_name", ["name"]),

  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("done"),
      v.literal("blocked")
    ),
    assigneeIds: v.array(v.id("agents")),
    tags: v.array(v.string()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_updated", ["updatedAt"])
    .index("by_title", ["title"]),

  messages: defineTable({
    taskId: v.id("tasks"),
    fromAgentId: v.optional(v.id("agents")),
    fromHuman: v.optional(v.boolean()),
    content: v.string(),
    attachments: v.array(v.id("documents")),
    createdAt: v.number(),
  }).index("by_task", ["taskId"]),

  activities: defineTable({
    type: v.string(),
    agentId: v.optional(v.id("agents")),
    message: v.string(),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  documents: defineTable({
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
  }).index("by_task", ["taskId"]),

  notifications: defineTable({
    mentionedAgentId: v.id("agents"),
    content: v.string(),
    delivered: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_delivered", ["delivered"])
    .index("by_agent", ["mentionedAgentId"]),
});
