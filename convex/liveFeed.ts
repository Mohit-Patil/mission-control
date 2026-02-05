import { query } from "./_generated/server";
import { v } from "convex/values";

export const latest = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    // NOTE: uses [workspaceId, createdAt] index but we only constrain by workspaceId.
    return await ctx.db
      .query("activities")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(50);
  },
});
