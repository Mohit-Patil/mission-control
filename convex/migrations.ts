import { mutation } from "./_generated/server";

/**
 * One-time migration helper.
 *
 * When upgrading an existing deployment to the Workspaces schema:
 * - ensures a default workspace exists
 * - backfills workspaceId on all existing rows
 *
 * Safe to run multiple times (idempotent).
 */
export const migrateToWorkspaces = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1) Ensure default workspace
    const existingDefault = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", "default"))
      .unique();

    const defaultWorkspaceId =
      existingDefault?._id ??
      (await ctx.db.insert("workspaces", {
        name: "Default",
        slug: "default",
        createdAt: now,
        updatedAt: now,
      }));

    // 2) Backfill tables
    const tables: Array<
      "agents" | "tasks" | "messages" | "activities" | "documents" | "notifications"
    > = ["agents", "tasks", "messages", "activities", "documents", "notifications"];

    const patched: Record<string, number> = {};

    for (const table of tables) {
      const rows = await ctx.db.query(table).collect();
      let n = 0;
      for (const r of rows) {
        // @ts-expect-error - legacy docs may not have workspaceId.
        if (r.workspaceId) continue;
        await ctx.db.patch(r._id, { workspaceId: defaultWorkspaceId } as any);
        n++;
      }
      patched[table] = n;
    }

    // 3) Touch workspace updatedAt
    await ctx.db.patch(defaultWorkspaceId, { updatedAt: now });

    return {
      ok: true,
      defaultWorkspaceId,
      patched,
    };
  },
});
