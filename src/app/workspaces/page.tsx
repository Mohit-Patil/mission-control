"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function WorkspacesPage() {
  const router = useRouter();
  const workspaces = useQuery(api.workspaces.list);
  const create = useMutation(api.workspaces.create);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const suggested = useMemo(() => (name ? slugify(name) : ""), [name]);

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
              Mission Control
            </div>
            <h1 className="mt-2 text-[20px] font-semibold text-zinc-900">Workspaces</h1>
          </div>
          <Link className="mc-pill bg-zinc-100 text-zinc-700" href="/">
            Back
          </Link>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-[12px] font-semibold text-zinc-900">Create workspace</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="mc-form-row">
              <label className="mc-form-label">Name</label>
              <input
                className="mc-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SiteGPT"
              />
            </div>
            <div className="mc-form-row">
              <label className="mc-form-label">Slug</label>
              <input
                className="mc-input"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={suggested || "e.g. sitegpt"}
              />
              <div className="mt-1 text-[10px] text-zinc-400">Used in URLs: /w/&lt;slug&gt;</div>
            </div>
          </div>

          {error ? <div className="mt-3 text-[12px] text-red-600">{error}</div> : null}

          <div className="mt-4 flex justify-end">
            <button
              className="mc-pill bg-zinc-900 text-white"
              type="button"
              onClick={async () => {
                setError(null);
                const cleanName = name.trim();
                if (!cleanName) return;
                const cleanSlug = (slug || suggested).trim();
                try {
                  await create({ name: cleanName, slug: cleanSlug || undefined });
                  const nextSlug = cleanSlug || suggested;
                  if (nextSlug) {
                    window.localStorage.setItem("mc:lastWorkspaceSlug", nextSlug);
                    router.push(`/w/${nextSlug}`);
                  } else {
                    router.push("/");
                  }
                } catch (e: any) {
                  setError(e?.message ?? "Failed to create workspace");
                }
              }}
            >
              Create
            </button>
          </div>
        </div>

        <div className="mt-8">
          <div className="text-[12px] font-semibold text-zinc-900">Existing</div>
          <div className="mt-3 grid gap-2">
            {(workspaces ?? []).map((w) => (
              <Link
                key={w._id}
                href={`/w/${w.slug}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-[12px] text-zinc-800 hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{w.name}</div>
                  <div className="mt-1 text-[10px] text-zinc-400">{w.slug}</div>
                </div>
                <span className="mc-chip bg-zinc-100">Open</span>
              </Link>
            ))}
            {workspaces && workspaces.length === 0 ? (
              <div className="text-[12px] text-zinc-500">No workspaces yet.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
