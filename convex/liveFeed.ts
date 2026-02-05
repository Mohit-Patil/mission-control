import { query } from "./_generated/server";

export const latest = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("activities")
      .withIndex("by_created")
      .order("desc")
      .take(50);
  },
});
