"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

type AgentLevel = "LEAD" | "SPC" | "INT";
type AgentStatus = "idle" | "active" | "blocked";

type Draft = {
  id?: Id<"agents">;
  name: string;
  role: string;
  level: AgentLevel;
  status: AgentStatus;
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

  const [selectedId, setSelectedId] = useState<Id<"agents"> | "new" | null>("new");
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

  useEffect(() => {
    if (!agents || agents.length === 0) return;
    if (selectedId === "new") {
      setSelectedId(agents[0]._id);
    }
  }, [agents, selectedId]);

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
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
              Workspace
            </div>
            <div className="mt-1 text-[18px] font-semibold text-zinc-900">{workspace.name}</div>
            <div className="mt-1 text-[11px] text-zinc-500">Agents</div>
          </div>
          <div className="flex items-center gap-2">
            <Link className="mc-pill bg-zinc-100 text-zinc-700" href={`/w/${workspace.slug}`}>
              Dashboard
            </Link>
            <Link className="mc-pill bg-zinc-100 text-zinc-700" href="/workspaces">
              Workspaces
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-12 gap-4">
          <aside className="col-span-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-zinc-900">All agents</div>
              <button
                className="mc-pill bg-zinc-900 text-white"
                type="button"
                onClick={selectNew}
              >
                + New
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
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
                    </div>
                  </button>
                );
              })}
              {agents && agents.length === 0 ? (
                <div className="text-[12px] text-zinc-500">No agents yet.</div>
              ) : null}
            </div>
          </aside>

          <section className="col-span-7 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                  {selectedId === "new" ? "New agent" : "Edit agent"}
                </div>
                <div className="mt-1 text-[16px] font-semibold text-zinc-900">
                  {draft.name || "Untitled"}
                </div>
              </div>
              <div className="flex items-center gap-2">
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
                      const id = await upsert({
                        workspaceId: workspace._id,
                        id: draft.id,
                        name,
                        role,
                        level: draft.level,
                        status: draft.status,
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

            {info ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
                {info}
              </div>
            ) : null}
            {selectedId !== "new" && recentRuns ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
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
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
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

              <div className="mc-form-row col-span-2">
                <label className="mc-form-label">Session key</label>
                <input
                  className="mc-input"
                  value={draft.sessionKey}
                  onChange={(e) => setDraft((d) => ({ ...d, sessionKey: e.target.value }))}
                  placeholder="Optional"
                />
              </div>

              <div className="mc-form-row col-span-2">
                <label className="mc-form-label">Prompt</label>
                <textarea
                  className="mc-textarea"
                  value={draft.prompt}
                  onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
                  placeholder="Operator-facing prompt / instructions"
                  rows={6}
                />
              </div>

              <div className="mc-form-row col-span-2">
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

            <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px] text-zinc-600">
              CLI hint: <code>missionctl agent upsert --workspace {workspace.slug} ...</code>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
