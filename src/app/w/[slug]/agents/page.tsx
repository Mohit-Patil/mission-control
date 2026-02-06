"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

type AgentLevel = "COORD" | "LEAD" | "SPC" | "INT";
type AgentStatus = "idle" | "active" | "blocked";

type Draft = {
  id?: Id<"agents">;
  name: string;
  role: string;
  level: AgentLevel;
  status: AgentStatus;
  tags: string;
  sessionKey: string;
  prompt: string;
  systemNotes: string;
};

function toDraft(a?: Doc<"agents"> | null): Draft {
  return {
    id: a?._id,
    name: a?.name ?? "",
    role: a?.role ?? "",
    level: (a?.level as AgentLevel) ?? "SPC",
    status: (a?.status as AgentStatus) ?? "idle",
    tags: (a?.tags ?? []).join(", "),
    sessionKey: a?.sessionKey ?? "",
    prompt: a?.prompt ?? "",
    systemNotes: a?.systemNotes ?? "",
  };
}

function errorMessage(e: unknown) {
  if (e && typeof e === "object" && "message" in e) {
    const msg = (e as { message?: unknown }).message;
    return String(msg);
  }
  return String(e ?? "Unknown error");
}

export default function WorkspaceAgentsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const workspace = useQuery(api.workspaces.getBySlug, { slug });

  useEffect(() => {
    if (!workspace) return;
    window.localStorage.setItem("mc:lastWorkspaceSlug", workspace.slug);
  }, [workspace]);

  const agents = useQuery(
    api.agents.list,
    workspace ? { workspaceId: workspace._id } : "skip"
  );

  const [userSelectedId, setUserSelectedId] = useState<Id<"agents"> | "new" | null>(null);
  const selectedId: Id<"agents"> | "new" = useMemo(() => {
    if (userSelectedId !== null) return userSelectedId;
    if (agents && agents.length > 0) return agents[0]._id;
    return "new";
  }, [userSelectedId, agents]);
  const setSelectedId = setUserSelectedId;
  const upsert = useMutation(api.agents.upsert);
  const createRunRequest = useMutation(api.runRequests.create);
  const recentRuns = useQuery(
    api.runRequests.listForAgent,
    workspace && selectedId && selectedId !== "new"
      ? { workspaceId: workspace._id, agentId: selectedId, limit: 1 }
      : "skip"
  );
  const [info, setInfo] = useState<string | null>(null);
  const selected = useMemo(() => {
    if (!agents || !selectedId || selectedId === "new") return null;
    return agents.find((a) => a._id === selectedId) ?? null;
  }, [agents, selectedId]);

  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedId, setLastSyncedId] = useState<string | null>(null);

  // Sync draft when auto-selected agent changes (e.g. on first load)
  if (selectedId !== "new" && selected && lastSyncedId !== selectedId) {
    setDraft(toDraft(selected));
    setLastSyncedId(selectedId);
  }

  const selectNew = () => {
    setError(null);
    setInfo(null);
    setSelectedId("new");
    setDraft(toDraft(null));
  };

  const selectExisting = (agent: Doc<"agents">) => {
    setError(null);
    setInfo(null);
    setSelectedId(agent._id);
    setDraft(toDraft(agent));
  };

  if (workspace === undefined) {
    return <div className="p-6 text-[12px] text-zinc-600">Loading…</div>;
  }

  if (workspace === null) {
    return (
      <div className="p-8">
        <div className="text-[14px] font-semibold text-zinc-900">Workspace not found</div>
        <div className="mt-4">
          <Link className="mc-pill bg-zinc-900 text-white" href="/workspaces">
            Go to workspaces
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-root">
      <header className="mc-topbar">
        <div className="mc-topbar-main">
          <div className="mc-topbar-brand">
            <span className="mc-diamond" aria-hidden />
            <div className="text-[12px] font-semibold tracking-[0.18em] text-zinc-800">Mission Control</div>
          </div>
        </div>

        <div className="mc-topbar-content" style={{ maxHeight: "none", opacity: 1, pointerEvents: "auto" as const }}>
          <div className="mc-topbar-row mc-topbar-workspace">
            <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.12em]">{workspace.name}</div>
            <span className="mc-topbar-sep" aria-hidden />
            <div className="text-[13px] font-semibold text-zinc-900">Agents</div>
          </div>

          <div className="mc-topbar-row mc-topbar-actions">
            <Link className="mc-topbar-link" href={`/w/${workspace.slug}`}>
              Dashboard
            </Link>
            <Link className="mc-topbar-link" href="/workspaces">
              Workspaces
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl" style={{ padding: "20px 14px" }}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <aside className="lg:col-span-5 mc-panel">
            <div className="mc-panel-header">
              <div className="flex items-center gap-2">
                <span className="mc-dot muted" aria-hidden />
                <div className="mc-panel-title">Agents</div>
              </div>
              <button
                className="mc-pill bg-zinc-900 text-white"
                type="button"
                onClick={selectNew}
              >
                + New
              </button>
            </div>

            <div className="mc-panel-body flex flex-col gap-2">
              {(agents ?? []).map((a) => {
                const active = selectedId === a._id;
                return (
                  <button
                    key={a._id}
                    type="button"
                    className={
                      "flex items-center gap-3 rounded-lg border px-3 py-2 text-left " +
                      (active
                        ? "border-zinc-900 bg-zinc-50"
                        : "border-zinc-200 bg-white hover:bg-zinc-50")
                    }
                    onClick={() => selectExisting(a)}
                  >
                    <span className="mc-mini-avatar" aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-zinc-900">{a.name}</div>
                      <div className="truncate text-[10px] text-zinc-500">
                        {a.level} • {a.status} • {a.role}
                      </div>
                      {(a.tags ?? []).length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {(a.tags ?? []).map((t) => (
                            <span key={t} className="mc-pill bg-violet-50 text-violet-600 text-[9px]">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
              {agents && agents.length === 0 ? (
                <div className="text-[12px] text-zinc-500">No agents yet.</div>
              ) : null}
            </div>
          </aside>

          <section className="lg:col-span-7 mc-panel">
            <div className="mc-panel-header mc-panel-header-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="mc-dot amber" aria-hidden />
                <div className="mc-panel-title">
                  {selectedId === "new" ? "New Agent" : "Edit Agent"}
                </div>
                <span className="mc-topbar-sep" aria-hidden />
                <div className="text-[13px] font-semibold text-zinc-900 truncate">
                  {draft.name || "Untitled"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="mc-pill bg-zinc-100 text-zinc-700"
                  type="button"
                  onClick={() => {
                    setError(null);
                    setDraft(toDraft(selectedId === "new" ? null : selected));
                  }}
                >
                  Reset
                </button>
                {selectedId !== "new" ? (
                  <button
                    className="mc-pill bg-zinc-100 text-zinc-700"
                    type="button"
                    onClick={async () => {
                      if (!workspace || !selectedId || selectedId === "new") return;
                      try {
                        await createRunRequest({
                          workspaceId: workspace._id,
                          agentId: selectedId,
                        });
                        setInfo("Run request queued. Agent will run within ~1 minute.");
                      } catch (err) {
                        setError(errorMessage(err));
                      }
                    }}
                  >
                    Run Now
                  </button>
                ) : null}
                <button
                  className="mc-pill bg-zinc-900 text-white"
                  type="button"
                  onClick={async () => {
                    setError(null);
                    const name = draft.name.trim();
                    const role = draft.role.trim();
                    if (!name || !role) {
                      setError("Name and role are required.");
                      return;
                    }
                    try {
                      const tagList = draft.tags
                        .split(",")
                        .map((t) => t.trim().toLowerCase())
                        .filter(Boolean);
                      const id = await upsert({
                        workspaceId: workspace._id,
                        id: draft.id,
                        name,
                        role,
                        level: draft.level,
                        status: draft.status,
                        tags: tagList.length ? tagList : undefined,
                        sessionKey: draft.sessionKey.trim() ? draft.sessionKey.trim() : undefined,
                        prompt: draft.prompt.trim() ? draft.prompt : undefined,
                        systemNotes: draft.systemNotes.trim() ? draft.systemNotes : undefined,
                      });
                      setSelectedId(id);
                      setDraft((d) => ({ ...d, id }));
                      setInfo("Agent saved.");
                    } catch (e: unknown) {
                      setError(errorMessage(e) || "Failed to save agent");
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </div>

            <div className="mc-panel-body">
            {info ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700 mb-3">
                {info}
              </div>
            ) : null}
            {selectedId !== "new" && recentRuns ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 mb-3">
                {recentRuns[0] ? (
                  <div>
                    Last run: <span className="font-medium">{recentRuns[0].status}</span>
                    {recentRuns[0].updatedAt
                      ? ` • ${new Date(recentRuns[0].updatedAt).toLocaleString()}`
                      : ""}
                    {recentRuns[0].note ? ` • ${recentRuns[0].note}` : ""}
                  </div>
                ) : (
                  <div>No runs yet.</div>
                )}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 mb-3">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="mc-form-row">
                <label className="mc-form-label">Name</label>
                <input
                  className="mc-input"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Jarvis"
                />
              </div>
              <div className="mc-form-row">
                <label className="mc-form-label">Role</label>
                <input
                  className="mc-input"
                  value={draft.role}
                  onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                  placeholder="e.g. Ops"
                />
              </div>

              <div className="mc-form-row">
                <label className="mc-form-label">Level</label>
                <select
                  className="mc-input"
                  value={draft.level}
                  onChange={(e) => setDraft((d) => ({ ...d, level: e.target.value as AgentLevel }))}
                >
                  <option value="COORD">COORD</option>
                  <option value="LEAD">LEAD</option>
                  <option value="SPC">SPC</option>
                  <option value="INT">INT</option>
                </select>
              </div>
              <div className="mc-form-row">
                <label className="mc-form-label">Status</label>
                <select
                  className="mc-input"
                  value={draft.status}
                  onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as AgentStatus }))}
                >
                  <option value="idle">idle</option>
                  <option value="active">active</option>
                  <option value="blocked">blocked</option>
                </select>
              </div>

              <div className="mc-form-row sm:col-span-2">
                <label className="mc-form-label">Tags</label>
                <input
                  className="mc-input"
                  value={draft.tags}
                  onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
                  placeholder="e.g. frontend, ui, react (comma-separated)"
                />
                <div className="mt-1 text-[10px] text-zinc-400">
                  Used for auto-routing: inbox tasks with matching tags get claimed by this agent
                </div>
              </div>

              <div className="mc-form-row sm:col-span-2">
                <label className="mc-form-label">Session key</label>
                <input
                  className="mc-input"
                  value={draft.sessionKey}
                  onChange={(e) => setDraft((d) => ({ ...d, sessionKey: e.target.value }))}
                  placeholder="Optional"
                />
              </div>

              <div className="mc-form-row sm:col-span-2">
                <label className="mc-form-label">Prompt</label>
                <textarea
                  className="mc-textarea"
                  value={draft.prompt}
                  onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
                  placeholder="Operator-facing prompt / instructions"
                  rows={6}
                />
              </div>

              <div className="mc-form-row sm:col-span-2">
                <label className="mc-form-label">System notes</label>
                <textarea
                  className="mc-textarea"
                  value={draft.systemNotes}
                  onChange={(e) => setDraft((d) => ({ ...d, systemNotes: e.target.value }))}
                  placeholder="Internal notes"
                  rows={4}
                />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px] text-zinc-600">
              CLI hint: <code>missionctl agent upsert --workspace {workspace.slug} ...</code>
            </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
