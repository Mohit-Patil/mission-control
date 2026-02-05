import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("workspaces").withIndex("by_updated").order("desc").collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const base = (args.slug ?? "").trim() || slugify(args.name);
    const slug = base || `workspace-${now}`;

    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error("Workspace slug already exists");

    return await ctx.db.insert("workspaces", {
      name: args.name.trim(),
      slug,
      createdAt: now,
      updatedAt: now,
    });
  },
});
