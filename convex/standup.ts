import { query } from "./_generated/server";
import { v } from "convex/values";

function extractStatus(message: string): string | null {
  const idx = message.lastIndexOf(" to ");
  if (idx === -1) return null;
  const status = message.slice(idx + 4).trim();
  return status || null;
}

export const daily = query({
  args: {
    workspaceId: v.id("workspaces"),
    hours: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const hours = Math.min(168, Math.max(1, args.hours ?? 24));
    const since = Date.now() - hours * 60 * 60 * 1000;
    const limit = Math.min(2000, Math.max(1, args.limit ?? 500));

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_workspace_name", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const nameById = new Map(agents.map((a) => [a._id, a.name] as const));

    const recent = await ctx.db
      .query("activities")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(limit);
    const windowed = recent.filter((a) => a.createdAt >= since);

    type Bucket = {
      agentId: string | null;
      agentName: string;
      total: number;
      byType: Record<string, number>;
      byStatus: Record<string, number>;
      recentMessages: { createdAt: number; message: string; type: string }[];
    };

    const buckets = new Map<string, Bucket>();
    const keyFor = (agentId?: string | null) => agentId ?? "(none)";

    for (const a of windowed) {
      const key = keyFor(a.agentId ?? null);
      const bucket: Bucket =
        buckets.get(key) ??
        ({
          agentId: a.agentId ?? null,
          agentName: a.agentId ? nameById.get(a.agentId) ?? "Agent" : "System/Human",
          total: 0,
          byType: {},
          byStatus: {},
          recentMessages: [],
        } satisfies Bucket);

      bucket.total++;
      bucket.byType[a.type] = (bucket.byType[a.type] ?? 0) + 1;

      if (a.type === "task_status") {
        const status = extractStatus(a.message);
        if (status) bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;
      }

      if (bucket.recentMessages.length < 5) {
        bucket.recentMessages.push({ createdAt: a.createdAt, message: a.message, type: a.type });
      }

      buckets.set(key, bucket);
    }

    return {
      workspaceId: args.workspaceId,
      hours,
      since,
      totalActivities: windowed.length,
      byAgent: Array.from(buckets.values()).sort((x, y) => y.total - x.total),
    };
  },
});
