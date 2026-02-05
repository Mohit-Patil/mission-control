"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type TaskStatus =
  | "inbox"
  | "assigned"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

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
  id,
  title,
  description,
  tags,
  assignees,
  updatedAgo,
  onClick,
  draggable,
  isKeyboardDragging,
  onDragStart,
  onKeyDown,
}: {
  id: string;
  title: string;
  description: string;
  tags: string[];
  assignees?: { name: string }[];
  updatedAgo: string;
  onClick?: () => void;
  draggable?: boolean;
  isKeyboardDragging?: boolean;
  onDragStart?: (id: string) => void;
  onKeyDown?: (e: React.KeyboardEvent, id: string) => void;
}) {
  return (
    <button
      className={
        "mc-card mc-card-click focus:outline-none focus:ring-2 focus:ring-zinc-900/10 " +
        (isKeyboardDragging ? "ring-2 ring-zinc-900/20" : "")
      }
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={(e) => {
        if (!onDragStart) return;
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(id);
      }}
      onKeyDown={(e) => onKeyDown?.(e, id)}
      aria-grabbed={isKeyboardDragging ? true : undefined}
      title={
        draggable
          ? "Drag to another column, or press Space to pick up and use Arrow keys to move"
          : undefined
      }
    >
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

function NewTaskModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: Id<"tasks">) => void;
}) {
  const createTask = useMutation(api.tasks.create);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<TaskStatus | "">("");

  if (!open) return null;

  return (
    <div className="mc-modal-root" role="dialog" aria-modal="true">
      <button className="mc-modal-backdrop" type="button" onClick={onClose} aria-label="Close" />
      <div className="mc-modal">
        <div className="mc-modal-header">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
              New Task
            </div>
            <div className="mt-1 text-[16px] font-semibold text-zinc-900">Create task</div>
          </div>
          <button className="mc-icon-btn" type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form
          className="mc-modal-body"
          onSubmit={async (e) => {
            e.preventDefault();
            const cleanTitle = title.trim();
            if (!cleanTitle) return;

            const tagList = tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);

            const id = await createTask({
              title: cleanTitle,
              description: description.trim() ? description.trim() : undefined,
              tags: tagList.length ? tagList : undefined,
              status: status || undefined,
            });

            setTitle("");
            setDescription("");
            setTags("");
            setStatus("");
            onClose();
            onCreated(id);
          }}
        >
          <div className="mc-form-row">
            <label className="mc-form-label">Title</label>
            <input
              className="mc-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Update pricing page copy"
              autoFocus
            />
          </div>

          <div className="mc-form-row">
            <label className="mc-form-label">Description</label>
            <textarea
              className="mc-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={4}
            />
          </div>

          <div className="mc-form-row">
            <label className="mc-form-label">Tags</label>
            <input
              className="mc-input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Comma separated (e.g. ui, ux, internal)"
            />
          </div>

          <div className="mc-form-row">
            <label className="mc-form-label">Status</label>
            <select
              className="mc-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus | "")}
            >
              <option value="">Inbox (default)</option>
              <option value="inbox">Inbox</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="review">Review</option>
              <option value="done">Done</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          <div className="mc-modal-footer">
            <button className="mc-pill bg-zinc-100 text-zinc-700" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="mc-pill bg-zinc-900 text-white" type="submit">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskDetailDrawer({
  open,
  taskId,
  task,
  agents,
  agentNameById,
  onClose,
}: {
  open: boolean;
  taskId: Id<"tasks"> | null;
  task:
    | {
        _id: Id<"tasks">;
        title: string;
        description?: string;
        status: string;
        tags: string[];
        assigneeIds: Id<"agents">[];
        updatedAt: number;
      }
    | null;
  agents: { _id: Id<"agents">; name: string }[];
  agentNameById: Map<string, string>;
  onClose: () => void;
}) {
  const messages = useQuery(api.messages.listByTask, open && taskId ? { taskId } : "skip");
  const createMessage = useMutation(api.messages.create);
  const updateStatus = useMutation(api.tasks.updateStatus);
  const setAssignees = useMutation(api.tasks.setAssignees);
  const [draft, setDraft] = useState("");

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
            <div className="flex items-center gap-8">
              <select
                className="mc-input"
                value={task?.status ?? "inbox"}
                onChange={async (e) => {
                  if (!taskId) return;
                  const next = e.target.value as TaskStatus;
                  await updateStatus({
                    id: taskId,
                    status: next,
                    fromHuman: true,
                    actorName: "Human",
                  });
                }}
              >
                <option value="inbox">Inbox</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
                <option value="blocked">Blocked</option>
              </select>
              <div className="ml-auto text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                Click to move
              </div>
            </div>
          </div>

          <div className="mc-drawer-section">
            <div className="mc-drawer-label">Assignees</div>
            <div className="flex flex-wrap gap-1">
              {(task?.assigneeIds ?? []).length ? (
                (task?.assigneeIds ?? []).map((aid) => (
                  <span key={aid} className="mc-tag">
                    {agentNameById.get(aid) ?? "Agent"}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-zinc-400">—</span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {agents.map((a) => {
                const checked = (task?.assigneeIds ?? []).includes(a._id);
                return (
                  <label
                    key={a._id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-2 text-[12px] text-zinc-700 hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={async () => {
                        if (!taskId || !task) return;
                        const next = checked
                          ? task.assigneeIds.filter((x) => x !== a._id)
                          : [...task.assigneeIds, a._id];
                        await setAssignees({
                          id: taskId,
                          assigneeIds: next,
                          fromHuman: true,
                          actorName: "Human",
                        });
                      }}
                    />
                    <span className="truncate">{a.name}</span>
                  </label>
                );
              })}
            </div>
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

            <div className="mc-thread">
              {(messages ?? []).length ? (
                (messages ?? []).map((m) => {
                  const author = m.fromHuman
                    ? "Human"
                    : m.fromAgentId
                      ? agentNameById.get(m.fromAgentId) ?? "Agent"
                      : "System";
                  return (
                    <div key={m._id} className="mc-msg">
                      <div className="mc-msg-meta">
                        <span className="mc-msg-author">{author}</span>
                        <span className="mc-msg-time">{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="mc-msg-body">{m.content}</div>
                    </div>
                  );
                })
              ) : (
                <div className="mc-thread-placeholder">No messages yet. Add the first comment.</div>
              )}
            </div>

            <form
              className="mc-msg-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!taskId) return;
                const content = draft.trim();
                if (!content) return;
                await createMessage({
                  taskId,
                  content,
                  fromHuman: true,
                  actorName: "Human",
                });
                setDraft("");
              }}
            >
              <textarea
                className="mc-textarea"
                placeholder="Write a comment…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  className="mc-pill bg-zinc-100 text-zinc-700"
                  type="button"
                  onClick={() => setDraft("")}
                >
                  Clear
                </button>
                <button className="mc-pill bg-zinc-900 text-white" type="submit">
                  Post
                </button>
              </div>
            </form>
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
  const agents = useQuery(api.agents.list);
  const inbox = useQuery(api.tasks.listByStatus, { status: "inbox" });
  const assigned = useQuery(api.tasks.listByStatus, { status: "assigned" });
  const inProgress = useQuery(api.tasks.listByStatus, { status: "in_progress" });
  const review = useQuery(api.tasks.listByStatus, { status: "review" });
  const done = useQuery(api.tasks.listByStatus, { status: "done" });
  const liveFeed = useQuery(api.liveFeed.latest);
  const undeliveredTotal = useQuery(api.notifications.totalUndelivered);

  const updateStatus = useMutation(api.tasks.updateStatus);

  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [keyboardDrag, setKeyboardDrag] = useState<{
    taskId: Id<"tasks">;
    columnIndex: number;
  } | null>(null);
  const [a11yAnnouncement, setA11yAnnouncement] = useState<string>("");

  const columns = useMemo(
    () =>
      [
        { key: "inbox", title: "Inbox", tasks: inbox ?? [] },
        { key: "assigned", title: "Assigned", tasks: assigned ?? [] },
        { key: "in_progress", title: "In Progress", tasks: inProgress ?? [] },
        { key: "review", title: "Review", tasks: review ?? [] },
        { key: "done", title: "Done", tasks: done ?? [] },
      ] as const,
    [inbox, assigned, inProgress, review, done]
  );

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    for (const col of columns) {
      const t = col.tasks.find((x) => x._id === selectedTaskId);
      if (t) return t;
    }
    return null;
  }, [columns, selectedTaskId]);

  const agentNameById = useMemo(() => {
    return new Map((agents ?? []).map((a) => [a._id, a.name] as const));
  }, [agents]);

  useEffect(() => {
    if (!a11yAnnouncement) return;
    const t = setTimeout(() => setA11yAnnouncement(""), 2000);
    return () => clearTimeout(t);
  }, [a11yAnnouncement]);

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
          <span className="mc-chip bg-zinc-100">
            Notifications {undeliveredTotal ?? 0}
          </span>
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
            <Chip>{agents?.length ?? 0}</Chip>
          </div>
          <div className="mc-panel-body flex flex-col gap-2">
            {(agents ?? []).slice(0, 9).map((a) => (
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
              <button
                className="mc-pill bg-zinc-900 text-white"
                type="button"
                onClick={() => setNewTaskOpen(true)}
              >
                + New Task
              </button>
              <Chip>
                <span className="mc-mini-avatar" aria-hidden /> 1
              </Chip>
              <Chip>35 active</Chip>
            </div>
          </div>

          <div className="mc-kanban">
            <div className="sr-only" aria-live="polite">
              {a11yAnnouncement}
            </div>

            {columns.map((col, columnIndex) => (
              <div
                key={col.key}
                className={"mc-column " + (dragOverColumn === col.key ? "outline outline-2 outline-zinc-900/10" : "")}
              >
                <div className="mc-column-header">
                  <div className="flex items-center gap-2">
                    <span className="mc-dot muted" aria-hidden />
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
                      {col.title}
                    </div>
                  </div>
                  <span className="mc-count">{col.tasks.length}</span>
                </div>

                <div
                  className="mc-column-body"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverColumn(col.key);
                  }}
                  onDragLeave={() => {
                    setDragOverColumn((cur) => (cur === col.key ? null : cur));
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    setDragOverColumn(null);
                    if (!id) return;
                    const taskId = id as Id<"tasks">;
                    await updateStatus({
                      id: taskId,
                      status: col.key,
                      fromHuman: true,
                      actorName: "Human",
                    });
                    setA11yAnnouncement(`Moved task to ${col.title}.`);
                  }}
                >
                  {col.tasks.map((t) => (
                    <TaskCard
                      key={t._id}
                      id={t._id}
                      title={t.title}
                      description={t.description ?? ""}
                      tags={t.tags ?? []}
                      assignees={(t.assigneeIds ?? []).map((aid) => ({
                        name: agentNameById.get(aid) ?? "Agent",
                      }))}
                      updatedAgo={new Date(t.updatedAt).toLocaleDateString()}
                      draggable
                      isKeyboardDragging={keyboardDrag?.taskId === t._id}
                      onDragStart={() => {
                        setKeyboardDrag(null);
                        setA11yAnnouncement(`Dragging ${t.title}. Drop on a column to move.`);
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === "Escape") {
                          if (keyboardDrag?.taskId === t._id) {
                            e.preventDefault();
                            setKeyboardDrag(null);
                            setA11yAnnouncement("Cancelled move.");
                          }
                          return;
                        }

                        // Space picks up / drops. Enter drops.
                        if (e.key === " " || e.key === "Enter") {
                          e.preventDefault();
                          if (!keyboardDrag || keyboardDrag.taskId !== t._id) {
                            setKeyboardDrag({ taskId: t._id, columnIndex });
                            setA11yAnnouncement(
                              `Picked up ${t.title}. Use Left/Right arrows to choose a column, then press Enter to drop.`
                            );
                          } else {
                            const dest = columns[keyboardDrag.columnIndex];
                            await updateStatus({
                              id: t._id,
                              status: dest.key,
                              fromHuman: true,
                              actorName: "Human",
                            });
                            setKeyboardDrag(null);
                            setA11yAnnouncement(`Moved ${t.title} to ${dest.title}.`);
                          }
                          return;
                        }

                        if (keyboardDrag?.taskId === t._id) {
                          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                            e.preventDefault();
                            const delta = e.key === "ArrowLeft" ? -1 : 1;
                            setKeyboardDrag((cur) => {
                              if (!cur) return cur;
                              const nextIndex = Math.max(0, Math.min(columns.length - 1, cur.columnIndex + delta));
                              const nextCol = columns[nextIndex];
                              setA11yAnnouncement(`Target column: ${nextCol.title}.`);
                              return { ...cur, columnIndex: nextIndex };
                            });
                          }
                        }
                      }}
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
              {(liveFeed ?? []).map((e) => (
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

      <NewTaskModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onCreated={(id) => setSelectedTaskId(id)}
      />

      <TaskDetailDrawer
        open={!!selectedTaskId}
        taskId={selectedTaskId}
        task={selectedTask}
        agents={agents ?? []}
        agentNameById={agentNameById}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}
