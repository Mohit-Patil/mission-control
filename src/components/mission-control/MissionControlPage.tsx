"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="mc-chip text-[10px] uppercase tracking-[0.16em] text-zinc-600">
      {children}
    </span>
  );
}

function Pill({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      className={
        "mc-pill " +
        (active
          ? "bg-white text-zinc-900 shadow-sm"
          : "bg-transparent text-zinc-500 hover:text-zinc-700")
      }
      type="button"
    >
      {children}
    </button>
  );
}

function AgentCard({
  name,
  role,
  level,
  status,
}: {
  name: string;
  role: string;
  level: string;
  status: string;
}) {
  return (
    <div className="mc-agent">
      <div className="mc-avatar" aria-hidden />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate text-[13px] font-medium text-zinc-900">{name}</div>
          <span className="mc-badge">{level}</span>
        </div>
        <div className="truncate text-[11px] text-zinc-500">{role}</div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="mc-dot" aria-hidden />
        <span className="text-[11px] font-medium text-emerald-700">{status}</span>
      </div>
    </div>
  );
}

function TaskCard({
  title,
  description,
  tags,
  assignees,
  updatedAgo,
  onClick,
}: {
  title: string;
  description: string;
  tags: string[];
  assignees?: { name: string }[];
  updatedAgo: string;
  onClick?: () => void;
}) {
  return (
    <button className="mc-card mc-card-click" type="button" onClick={onClick}>
      <div className="text-[13px] font-semibold leading-5 text-zinc-900">{title}</div>
      <div className="mt-1 line-clamp-3 text-[11px] leading-4 text-zinc-500">{description}</div>

      {assignees?.length ? (
        <div className="mt-3 flex items-center gap-2">
          {assignees.map((a) => (
            <div key={a.name} className="flex items-center gap-1 text-[11px] text-zinc-600">
              <span className="mc-mini-avatar" aria-hidden />
              <span>{a.name}</span>
            </div>
          ))}
          <span className="ml-auto text-[10px] text-zinc-400">{updatedAgo}</span>
        </div>
      ) : (
        <div className="mt-3 flex items-center">
          <span className="text-[10px] text-zinc-400">{updatedAgo}</span>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {tags.slice(0, 3).map((t) => (
          <span key={t} className="mc-tag">
            {t}
          </span>
        ))}
      </div>
    </button>
  );
}

function TaskDetailDrawer({
  open,
  task,
  onClose,
}: {
  open: boolean;
  task: { title: string; description?: string; status: string; tags: string[]; updatedAt: number } | null;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="mc-drawer-root" role="dialog" aria-modal="true">
      <button className="mc-drawer-backdrop" type="button" onClick={onClose} aria-label="Close" />
      <aside className="mc-drawer">
        <div className="mc-drawer-header">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
              Task Details
            </div>
            <div className="mt-1 truncate text-[16px] font-semibold text-zinc-900">
              {task?.title ?? ""}
            </div>
          </div>
          <button className="mc-icon-btn" type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mc-drawer-body">
          <div className="mc-drawer-section">
            <div className="mc-drawer-label">Status</div>
            <div className="mc-status-pill">{task?.status ?? ""}</div>
          </div>

          <div className="mc-drawer-section">
            <div className="mc-drawer-label">Description</div>
            <div className="text-[12px] leading-5 text-zinc-700 whitespace-pre-wrap">
              {task?.description || "—"}
            </div>
          </div>

          <div className="mc-drawer-section">
            <div className="mc-drawer-label">Tags</div>
            <div className="flex flex-wrap gap-1">
              {(task?.tags ?? []).length ? (
                (task?.tags ?? []).map((t) => (
                  <span key={t} className="mc-tag">
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-zinc-400">—</span>
              )}
            </div>
          </div>

          <div className="mc-drawer-section">
            <div className="mc-drawer-label">Messages</div>
            <div className="mc-thread-placeholder">Message thread (wire to Convex next)</div>
          </div>
        </div>

        <div className="mc-drawer-footer">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            Updated {task ? new Date(task.updatedAt).toLocaleString() : ""}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function MissionControlPage() {
  const agents = useQuery(api.agents.list) || [];
  const inbox = useQuery(api.tasks.listByStatus, { status: "inbox" }) || [];
  const assigned = useQuery(api.tasks.listByStatus, { status: "assigned" }) || [];
  const inProgress = useQuery(api.tasks.listByStatus, { status: "in_progress" }) || [];
  const review = useQuery(api.tasks.listByStatus, { status: "review" }) || [];
  const done = useQuery(api.tasks.listByStatus, { status: "done" }) || [];
  const liveFeed = useQuery(api.liveFeed.latest) || [];

  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);

  const columns = [
    { key: "inbox", title: "Inbox", tasks: inbox },
    { key: "assigned", title: "Assigned", tasks: assigned },
    { key: "in_progress", title: "In Progress", tasks: inProgress },
    { key: "review", title: "Review", tasks: review },
    { key: "done", title: "Done", tasks: done },
  ] as const;

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    for (const col of columns) {
      const t = col.tasks.find((x) => x._id === selectedTaskId);
      if (t) return t;
    }
    return null;
  }, [columns, selectedTaskId]);

  return (
    <div className="mc-root">
      {/* Top bar */}
      <header className="mc-topbar">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="mc-diamond" aria-hidden />
            <div className="text-[11px] font-semibold tracking-[0.2em] text-zinc-800">
              MISSION CONTROL
            </div>
          </div>
          <span className="mc-chip bg-zinc-100">SiteGPT</span>
        </div>

        <div className="flex items-center gap-10">
          <div className="text-center">
            <div className="text-[18px] font-semibold text-zinc-900">11</div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-400">
              Agents Active
            </div>
          </div>
          <div className="text-center">
            <div className="text-[18px] font-semibold text-zinc-900">35</div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-400">
              Tasks In Queue
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="mc-pill bg-zinc-100 text-zinc-700" type="button">
            Docs
          </button>
          <div className="text-right">
            <div className="text-[12px] font-semibold text-zinc-900">12:30:58</div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-400">
              Sat, Jan 31
            </div>
          </div>
          <div className="mc-online">Online</div>
        </div>
      </header>

      {/* Main grid */}
      <div className="mc-grid">
        {/* Agents */}
        <aside className="mc-panel">
          <div className="mc-panel-header">
            <div className="flex items-center gap-2">
              <span className="mc-dot muted" aria-hidden />
              <div className="mc-panel-title">Agents</div>
            </div>
            <Chip>{agents.length}</Chip>
          </div>
          <div className="mc-panel-body flex flex-col gap-2">
            {agents.slice(0, 9).map((a) => (
              <AgentCard
                key={a._id}
                name={a.name}
                role={a.role}
                level={a.level}
                status={a.status === "active" ? "WORKING" : a.status.toUpperCase()}
              />
            ))}
          </div>
        </aside>

        {/* Mission Queue */}
        <section className="mc-panel mc-panel-wide">
          <div className="mc-panel-header">
            <div className="flex items-center gap-2">
              <span className="mc-dot amber" aria-hidden />
              <div className="mc-panel-title">Mission Queue</div>
            </div>
            <div className="flex items-center gap-3">
              <Chip>
                <span className="mc-mini-avatar" aria-hidden /> 1
              </Chip>
              <Chip>35 active</Chip>
            </div>
          </div>

          <div className="mc-kanban">
            {columns.map((col) => (
              <div key={col.key} className="mc-column">
                <div className="mc-column-header">
                  <div className="flex items-center gap-2">
                    <span className="mc-dot muted" aria-hidden />
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
                      {col.title}
                    </div>
                  </div>
                  <span className="mc-count">{col.tasks.length}</span>
                </div>
                <div className="mc-column-body">
                  {col.tasks.map((t) => (
                    <TaskCard
                      key={t._id}
                      title={t.title}
                      description={t.description ?? ""}
                      tags={t.tags ?? []}
                      updatedAgo={new Date(t.updatedAt).toLocaleDateString()}
                      onClick={() => setSelectedTaskId(t._id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Live Feed */}
        <aside className="mc-panel">
          <div className="mc-panel-header">
            <div className="flex items-center gap-2">
              <span className="mc-dot green" aria-hidden />
              <div className="mc-panel-title">Live Feed</div>
            </div>
            <div />
          </div>

          <div className="mc-panel-body">
            <div className="mc-segment">
              <Pill active>All</Pill>
              <Pill>Tasks</Pill>
              <Pill>Comments</Pill>
              <Pill>Decisions</Pill>
              <Pill>Docs</Pill>
              <Pill>Status</Pill>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="mc-filter active">All Agents</span>
              <span className="mc-filter">Jarvis</span>
              <span className="mc-filter">Shuri</span>
              <span className="mc-filter">Fury</span>
              <span className="mc-filter">Vision</span>
              <span className="mc-filter">Loki</span>
              <span className="mc-filter">Wanda</span>
              <span className="mc-filter">Friday</span>
              <span className="mc-filter">Pepper</span>
              <span className="mc-filter">Quill</span>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {liveFeed.map((e) => (
                <div key={e._id} className="mc-feed-item">
                  <div className="mc-feed-avatar" aria-hidden />
                  <div className="min-w-0">
                    <div className="text-[12px] text-zinc-800">{e.message}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                      {new Date(e.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <TaskDetailDrawer
        open={!!selectedTaskId}
        task={selectedTask}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}
