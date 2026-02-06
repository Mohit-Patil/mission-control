"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type TaskStatus =
  | "inbox"
  | "assigned"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

type TaskStatusFilter = "all" | TaskStatus;
type LiveFeedFilter = "all" | "tasks" | "comments" | "decisions" | "docs" | "status";
type LiveFeedWindowFilter = "all" | "6h" | "24h" | "7d";

const TASK_STATUS_META: ReadonlyArray<{ key: TaskStatus; title: string }> = [
  { key: "inbox", title: "Inbox" },
  { key: "assigned", title: "Assigned" },
  { key: "in_progress", title: "In Progress" },
  { key: "review", title: "Review" },
  { key: "done", title: "Done" },
  { key: "blocked", title: "Blocked" },
];

const LIVE_FEED_FILTERS: ReadonlyArray<{ key: LiveFeedFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "tasks", label: "Tasks" },
  { key: "comments", label: "Comments" },
  { key: "decisions", label: "Decisions" },
  { key: "docs", label: "Docs" },
  { key: "status", label: "Status" },
];

const LIVE_FEED_WINDOWS: ReadonlyArray<{ key: LiveFeedWindowFilter; label: string }> = [
  { key: "all", label: "All Time" },
  { key: "6h", label: "6h" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
];

function matchesLiveFeedType(type: string, filter: LiveFeedFilter) {
  if (filter === "all") return true;
  if (filter === "comments") return type === "comment";
  if (filter === "tasks") return type === "task_created" || type === "task_assignees";
  if (filter === "status") return type.endsWith("status") || type.includes("_status");
  if (filter === "decisions") return type.includes("decision");
  if (filter === "docs") return type.includes("doc");
  return true;
}

function formatLiveFeedType(type: string) {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function matchesLiveFeedWindow(createdAt: number, filter: LiveFeedWindowFilter, nowMs: number) {
  if (filter === "all") return true;
  const hours = filter === "6h" ? 6 : filter === "24h" ? 24 : 24 * 7;
  return nowMs - createdAt <= hours * 60 * 60 * 1000;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="mc-chip text-[10px] uppercase tracking-[0.16em] text-zinc-600">
      {children}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="mc-skeleton-card">
      <div className="mc-skeleton-line mc-skeleton-line-lg" style={{ width: "70%" }} />
      <div className="mc-skeleton-line mt-2" style={{ width: "100%" }} />
      <div className="mc-skeleton-line mt-1" style={{ width: "85%" }} />
      <div className="flex items-center gap-2 mt-3">
        <div className="mc-skeleton-avatar" style={{ width: 14, height: 14, borderRadius: 5 }} />
        <div className="mc-skeleton-line" style={{ width: 60 }} />
        <div className="ml-auto mc-skeleton-line" style={{ width: 50 }} />
      </div>
    </div>
  );
}

function SkeletonAgentCard() {
  return (
    <div className="mc-agent" style={{ opacity: 0.7 }}>
      <div className="mc-skeleton-avatar" />
      <div className="min-w-0 flex-1">
        <div className="mc-skeleton-line mc-skeleton-line-lg" style={{ width: "60%" }} />
        <div className="mc-skeleton-line mc-skeleton-line-sm mt-1.5" style={{ width: "80%" }} />
      </div>
    </div>
  );
}

function SkeletonFeedItem() {
  return (
    <div className="mc-feed-item" style={{ opacity: 0.7 }}>
      <div className="mc-skeleton-avatar mc-skeleton-avatar-sm" />
      <div className="min-w-0 flex-1">
        <div className="mc-skeleton-line mc-skeleton-line-sm" style={{ width: "40%" }} />
        <div className="mc-skeleton-line mt-2" style={{ width: "90%" }} />
        <div className="mc-skeleton-line mc-skeleton-line-sm mt-2" style={{ width: "30%" }} />
      </div>
    </div>
  );
}

const EMPTY_STATE_ICONS: Record<string, string> = {
  task: "\u{1F4CB}",
  filter: "\u{1F50D}",
  feed: "\u{1F4E1}",
  agent: "\u{1F916}",
  message: "\u{1F4AC}",
};

function PanelState({
  kind,
  title,
  description,
  icon,
}: {
  kind: "loading" | "empty";
  title: string;
  description: string;
  icon?: string;
}) {
  const emoji = kind === "empty" && icon ? EMPTY_STATE_ICONS[icon] : null;
  return (
    <div className={kind === "loading" ? "mc-loading" : "mc-empty"} role="status" aria-live="polite">
      <div className="mc-state-head">
        {emoji ? (
          <span className="text-[18px]" aria-hidden>{emoji}</span>
        ) : (
          <span
            className={
              "mc-state-indicator " + (kind === "loading" ? "mc-state-indicator-loading" : "mc-state-indicator-empty")
            }
            aria-hidden
          />
        )}
        <div>
          <div className="mc-state-kicker">{kind === "loading" ? "Loading" : "Empty State"}</div>
          <div className="mc-state-title">{title}</div>
        </div>
      </div>
      <div className="mc-state-copy">{description}</div>
    </div>
  );
}

function Pill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={
        "mc-pill mc-pill-segment " +
        (active
          ? "bg-white text-zinc-900 shadow-sm"
          : "bg-transparent text-zinc-500 hover:text-zinc-700")
      }
      type="button"
      aria-pressed={active}
      onClick={onClick}
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
  rawStatus,
}: {
  name: string;
  role: string;
  level: string;
  status: string;
  rawStatus: string;
}) {
  const dotClass =
    rawStatus === "active"
      ? "mc-dot mc-dot-active"
      : rawStatus === "blocked"
        ? "mc-dot mc-dot-blocked"
        : "mc-dot mc-dot-idle";
  const statusColor =
    rawStatus === "active"
      ? "text-emerald-700"
      : rawStatus === "blocked"
        ? "text-red-600"
        : "text-zinc-500";

  return (
    <div className="mc-agent">
      <div className="mc-avatar" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-[13px] font-semibold text-zinc-900">{name}</div>
          <span className={`mc-badge shrink-0${level === "COORD" ? " mc-badge-coord" : ""}`}>{level}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="truncate text-[11px] text-zinc-500">{role}</div>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <span className={dotClass} aria-hidden />
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}>{status}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority || priority === "none") return null;
  const cls =
    priority === "high"
      ? "mc-priority mc-priority-high"
      : priority === "medium"
        ? "mc-priority mc-priority-medium"
        : "mc-priority mc-priority-low";
  return <span className={cls}>{priority}</span>;
}

function TaskCard({
  id,
  title,
  description,
  tags,
  priority,
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
  priority?: string;
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
      className={"mc-card mc-card-click " + (isKeyboardDragging ? "mc-card-dragging" : "")}
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
      aria-label={`Task ${title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[14px] font-semibold leading-snug text-zinc-900">{title}</div>
        <PriorityBadge priority={priority} />
      </div>
      <div className="mt-1 line-clamp-3 text-[12.5px] leading-5 text-zinc-600">{description}</div>

      {assignees?.length ? (
        <div className="mt-3 flex items-center gap-2">
          {assignees.map((a) => (
            <div key={a.name} className="flex items-center gap-1 text-[12px] text-zinc-700">
              <span className="mc-mini-avatar" aria-hidden />
              <span>{a.name}</span>
            </div>
          ))}
          <span className="ml-auto text-[11px] text-zinc-500">{updatedAgo}</span>
        </div>
      ) : (
        <div className="mt-3 flex items-center">
          <span className="text-[11px] text-zinc-500">{updatedAgo}</span>
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
  workspaceId,
  onClose,
  onCreated,
}: {
  open: boolean;
  workspaceId: Id<"workspaces">;
  onClose: () => void;
  onCreated: (id: Id<"tasks">) => void;
}) {
  const createTask = useMutation(api.tasks.create);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const titleId = "new-task-title";
  const descriptionId = "new-task-description";
  const tagsId = "new-task-tags";
  const statusId = "new-task-status";

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
              workspaceId,
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
            <label className="mc-form-label" htmlFor={titleId}>
              Title
            </label>
            <input
              id={titleId}
              className="mc-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Update pricing page copy"
              autoFocus
            />
          </div>

          <div className="mc-form-row">
            <label className="mc-form-label" htmlFor={descriptionId}>
              Description
            </label>
            <textarea
              id={descriptionId}
              className="mc-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={4}
            />
          </div>

          <div className="mc-form-row">
            <label className="mc-form-label" htmlFor={tagsId}>
              Tags
            </label>
            <input
              id={tagsId}
              className="mc-input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Comma separated (e.g. ui, ux, internal)"
            />
          </div>

          <div className="mc-form-row">
            <label className="mc-form-label" htmlFor={statusId}>
              Status
            </label>
            <select
              id={statusId}
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
  workspaceId,
  taskId,
  task,
  agents,
  agentNameById,
  onClose,
}: {
  open: boolean;
  workspaceId: Id<"workspaces">;
  taskId: Id<"tasks"> | null;
  task: Doc<"tasks"> | null;
  agents: { _id: Id<"agents">; name: string }[];
  agentNameById: Map<string, string>;
  onClose: () => void;
}) {
  const messages = useQuery(
    api.messages.listByTask,
    open && taskId ? { workspaceId, taskId } : "skip"
  );
  const createMessage = useMutation(api.messages.create);
  const updateStatus = useMutation(api.tasks.updateStatus);
  const setAssignees = useMutation(api.tasks.setAssignees);
  const removeTask = useMutation(api.tasks.remove);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

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
                    workspaceId,
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
                          workspaceId,
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
                <PanelState
                  kind="empty"
                  title="No messages yet"
                  description="Add the first comment to start collaboration on this task."
                  icon="message"
                />
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
                  workspaceId,
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
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-rose-600">Delete this task?</span>
              <button
                className="mc-pill bg-rose-600 text-white text-[11px]"
                type="button"
                onClick={async () => {
                  if (!taskId) return;
                  await removeTask({ workspaceId, id: taskId });
                  setConfirmDelete(false);
                  onClose();
                }}
              >
                Yes, delete
              </button>
              <button
                className="mc-pill bg-zinc-100 text-zinc-700 text-[11px]"
                type="button"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="mc-pill bg-zinc-100 text-rose-600 text-[11px]"
              type="button"
              onClick={() => setConfirmDelete(true)}
            >
              Delete task
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

export function MissionControlPage({ workspace }: { workspace: Doc<"workspaces"> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaces = useQuery(api.workspaces.list);

  const agents = useQuery(api.agents.list, { workspaceId: workspace._id });
  const inbox = useQuery(api.tasks.listByStatus, { workspaceId: workspace._id, status: "inbox" });
  const assigned = useQuery(api.tasks.listByStatus, { workspaceId: workspace._id, status: "assigned" });
  const inProgress = useQuery(api.tasks.listByStatus, {
    workspaceId: workspace._id,
    status: "in_progress",
  });
  const review = useQuery(api.tasks.listByStatus, { workspaceId: workspace._id, status: "review" });
  const done = useQuery(api.tasks.listByStatus, { workspaceId: workspace._id, status: "done" });
  const blocked = useQuery(api.tasks.listByStatus, { workspaceId: workspace._id, status: "blocked" });
  const liveFeed = useQuery(api.liveFeed.latest, { workspaceId: workspace._id });
  const undeliveredTotal = useQuery(api.notifications.totalUndelivered, {
    workspaceId: workspace._id,
  });

  const updateStatus = useMutation(api.tasks.updateStatus);

  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [mobileTopbarOpen, setMobileTopbarOpen] = useState(false);

  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [keyboardDrag, setKeyboardDrag] = useState<{
    taskId: Id<"tasks">;
    columnIndex: number;
  } | null>(null);
  const [a11yAnnouncement, setA11yAnnouncement] = useState<string>("");
  const [taskQuery, setTaskQuery] = useState(() => searchParams.get("q") ?? "");
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>(
    () => (searchParams.get("status") as TaskStatusFilter) || "all"
  );
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<"all" | "unassigned" | Id<"agents">>(
    () => (searchParams.get("assignee") as "all" | "unassigned" | Id<"agents">) || "all"
  );
  const [taskTagFilter, setTaskTagFilter] = useState<string>(
    () => searchParams.get("tag") ?? "all"
  );
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>(
    () => searchParams.get("priority") ?? "all"
  );
  const [feedQuery, setFeedQuery] = useState(() => searchParams.get("fq") ?? "");
  const [feedTypeFilter, setFeedTypeFilter] = useState<LiveFeedFilter>(
    () => (searchParams.get("ft") as LiveFeedFilter) || "all"
  );
  const [feedWindowFilter, setFeedWindowFilter] = useState<LiveFeedWindowFilter>(
    () => (searchParams.get("fw") as LiveFeedWindowFilter) || "all"
  );
  const [feedAgentFilter, setFeedAgentFilter] = useState<"all" | Id<"agents">>(
    () => (searchParams.get("fa") as "all" | Id<"agents">) || "all"
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  const columns = useMemo(
    () =>
      [
        { key: "inbox", title: "Inbox", tasks: inbox ?? [] },
        { key: "assigned", title: "Assigned", tasks: assigned ?? [] },
        { key: "in_progress", title: "In Progress", tasks: inProgress ?? [] },
        { key: "review", title: "Review", tasks: review ?? [] },
        { key: "done", title: "Done", tasks: done ?? [] },
        { key: "blocked", title: "Blocked", tasks: blocked ?? [] },
      ] as const,
    [inbox, assigned, inProgress, review, done, blocked]
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

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const col of columns) {
      for (const task of col.tasks) {
        for (const tag of task.tags ?? []) {
          tagSet.add(tag);
        }
      }
    }
    return Array.from(tagSet).sort();
  }, [columns]);

  const activeAgents = useMemo(() => (agents ?? []).filter((a) => a.status === "active").length, [agents]);
  const totalTasks = useMemo(() => columns.reduce((sum, c) => sum + c.tasks.length, 0), [columns]);
  const tasksLoading = useMemo(
    () => [inbox, assigned, inProgress, review, done, blocked].some((bucket) => bucket === undefined),
    [inbox, assigned, inProgress, review, done, blocked]
  );
  const agentsLoading = agents === undefined;
  const liveFeedLoading = liveFeed === undefined;

  const normalizedTaskQuery = taskQuery.trim().toLowerCase();
  const hasTaskFilters =
    normalizedTaskQuery.length > 0 ||
    taskAssigneeFilter !== "all" ||
    taskStatusFilter !== "all" ||
    taskTagFilter !== "all" ||
    taskPriorityFilter !== "all";

  const filteredColumns = useMemo(
    () =>
      columns.map((col) => {
        const visibleTasks = col.tasks.filter((task) => {
          const taskAssigneeIds = task.assigneeIds ?? [];

          if (taskStatusFilter !== "all" && task.status !== taskStatusFilter) return false;
          if (taskAssigneeFilter === "unassigned" && taskAssigneeIds.length > 0) return false;
          if (
            taskAssigneeFilter !== "all" &&
            taskAssigneeFilter !== "unassigned" &&
            !taskAssigneeIds.includes(taskAssigneeFilter)
          ) {
            return false;
          }

          if (taskTagFilter !== "all") {
            const taskTags = task.tags ?? [];
            if (!taskTags.includes(taskTagFilter)) return false;
          }

          if (taskPriorityFilter !== "all") {
            const taskPriority = (task as Record<string, unknown>).priority as string | undefined;
            if (taskPriorityFilter === "none") {
              if (taskPriority && taskPriority !== "none") return false;
            } else {
              if (taskPriority !== taskPriorityFilter) return false;
            }
          }

          if (!normalizedTaskQuery) return true;

          const assigneeNames = taskAssigneeIds.map((aid) => agentNameById.get(aid) ?? "");
          const haystack = [
            task.title,
            task.description ?? "",
            ...(task.tags ?? []),
            ...assigneeNames,
            col.title,
          ]
            .join(" ")
            .toLowerCase();

          return haystack.includes(normalizedTaskQuery);
        });

        return {
          ...col,
          totalCount: col.tasks.length,
          visibleTasks,
        };
      }),
    [columns, taskStatusFilter, taskAssigneeFilter, taskTagFilter, taskPriorityFilter, normalizedTaskQuery, agentNameById]
  );

  const boardColumns = useMemo(
    () =>
      filteredColumns.filter((col) => (taskStatusFilter === "all" ? true : col.key === taskStatusFilter)),
    [filteredColumns, taskStatusFilter]
  );

  const visibleTaskCount = useMemo(
    () => boardColumns.reduce((sum, col) => sum + col.visibleTasks.length, 0),
    [boardColumns]
  );
  const columnsWithVisibleTasks = useMemo(
    () => boardColumns.filter((col) => col.visibleTasks.length > 0).length,
    [boardColumns]
  );
  const selectedTaskStatusLabel = useMemo(() => {
    if (taskStatusFilter === "all") return "all columns";
    return TASK_STATUS_META.find((item) => item.key === taskStatusFilter)?.title ?? "selected status";
  }, [taskStatusFilter]);

  const normalizedFeedQuery = feedQuery.trim().toLowerCase();
  const hasFeedFilters =
    feedTypeFilter !== "all" ||
    feedWindowFilter !== "all" ||
    feedAgentFilter !== "all" ||
    normalizedFeedQuery.length > 0;

  const filteredFeed = useMemo(
    () =>
      (liveFeed ?? []).filter((entry) => {
        if (!matchesLiveFeedWindow(entry.createdAt, feedWindowFilter, nowMs)) return false;
        if (!matchesLiveFeedType(entry.type, feedTypeFilter)) return false;
        if (feedAgentFilter !== "all" && entry.agentId !== feedAgentFilter) return false;
        if (!normalizedFeedQuery) return true;

        const actor = entry.agentId ? agentNameById.get(entry.agentId) ?? "agent" : "system";
        const haystack = `${entry.message} ${entry.type} ${actor}`.toLowerCase();
        return haystack.includes(normalizedFeedQuery);
      }),
    [liveFeed, feedTypeFilter, feedWindowFilter, feedAgentFilter, normalizedFeedQuery, agentNameById, nowMs]
  );
  const feedTotalCount = liveFeed?.length ?? 0;
  const feedWindowLabel = useMemo(
    () => LIVE_FEED_WINDOWS.find((window) => window.key === feedWindowFilter)?.label ?? "All Time",
    [feedWindowFilter]
  );

  const taskFilterSummary = useMemo(() => {
    if (tasksLoading) return "Syncing mission queue…";
    if (!totalTasks) return "No tasks yet. Add a task to start dispatching work.";
    if (!hasTaskFilters) return `Showing all ${visibleTaskCount} tasks across ${boardColumns.length} columns.`;
    if (!visibleTaskCount) return `No tasks match filters (0 of ${totalTasks}).`;

    return `Showing ${visibleTaskCount} of ${totalTasks} tasks across ${columnsWithVisibleTasks} column(s) in ${selectedTaskStatusLabel}.`;
  }, [
    tasksLoading,
    totalTasks,
    hasTaskFilters,
    visibleTaskCount,
    boardColumns.length,
    columnsWithVisibleTasks,
    selectedTaskStatusLabel,
  ]);

  const feedFilterSummary = useMemo(() => {
    if (liveFeedLoading) return "Syncing activity stream…";
    if (!feedTotalCount) return "No activity yet. Task and comment updates will appear here.";
    if (!hasFeedFilters) return `${feedTotalCount} recent updates in the feed.`;
    if (!filteredFeed.length) return `No updates match current filters (${feedWindowLabel} window).`;
    return `${filteredFeed.length} of ${feedTotalCount} updates match current filters.`;
  }, [liveFeedLoading, feedTotalCount, hasFeedFilters, filteredFeed.length, feedWindowLabel]);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!a11yAnnouncement) return;
    const t = setTimeout(() => setA11yAnnouncement(""), 2000);
    return () => clearTimeout(t);
  }, [a11yAnnouncement]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1080px)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) {
        setMobileTopbarOpen(false);
      }
    };

    handleChange(media);
    const listener = (event: MediaQueryListEvent) => handleChange(event);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (!mobileTopbarOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileTopbarOpen(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [mobileTopbarOpen]);

  // Sync filters to URL search params (debounced for text inputs)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncFiltersToUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (taskQuery) params.set("q", taskQuery);
    if (taskStatusFilter !== "all") params.set("status", taskStatusFilter);
    if (taskAssigneeFilter !== "all") params.set("assignee", taskAssigneeFilter);
    if (taskTagFilter !== "all") params.set("tag", taskTagFilter);
    if (taskPriorityFilter !== "all") params.set("priority", taskPriorityFilter);
    if (feedQuery) params.set("fq", feedQuery);
    if (feedTypeFilter !== "all") params.set("ft", feedTypeFilter);
    if (feedWindowFilter !== "all") params.set("fw", feedWindowFilter);
    if (feedAgentFilter !== "all") params.set("fa", feedAgentFilter);

    const qs = params.toString();
    const target = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", target);
  }, [
    taskQuery, taskStatusFilter, taskAssigneeFilter, taskTagFilter, taskPriorityFilter,
    feedQuery, feedTypeFilter, feedWindowFilter, feedAgentFilter,
  ]);

  useEffect(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(syncFiltersToUrl, 300);
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [syncFiltersToUrl]);

  const activeTaskFilterCount = useMemo(() => {
    let count = 0;
    if (normalizedTaskQuery.length > 0) count++;
    if (taskStatusFilter !== "all") count++;
    if (taskAssigneeFilter !== "all") count++;
    if (taskTagFilter !== "all") count++;
    if (taskPriorityFilter !== "all") count++;
    return count;
  }, [normalizedTaskQuery, taskStatusFilter, taskAssigneeFilter, taskTagFilter, taskPriorityFilter]);

  const activeFeedFilterCount = useMemo(() => {
    let count = 0;
    if (normalizedFeedQuery.length > 0) count++;
    if (feedTypeFilter !== "all") count++;
    if (feedWindowFilter !== "all") count++;
    if (feedAgentFilter !== "all") count++;
    return count;
  }, [normalizedFeedQuery, feedTypeFilter, feedWindowFilter, feedAgentFilter]);

  const now = new Date();

  return (
    <div className="mc-root">
      <a className="mc-skip-nav" href="#mc-mission-queue">
        Skip to Mission Queue
      </a>

      {/* Top bar */}
      <header className="mc-topbar">
        <div className="mc-topbar-main">
          <div className="mc-topbar-brand">
            <span className="mc-diamond" aria-hidden />
            <div className="text-[12px] font-semibold tracking-[0.18em] text-zinc-800">Mission Control</div>
          </div>
          <div className="mc-topbar-main-actions">
            <span className="mc-chip mc-topbar-summary bg-zinc-100">
              Tasks {visibleTaskCount}/{totalTasks}
            </span>
            <button
              className="mc-pill mc-topbar-toggle bg-zinc-100 text-zinc-700"
              type="button"
              onClick={() => setMobileTopbarOpen((open) => !open)}
              aria-expanded={mobileTopbarOpen}
              aria-controls="mc-topbar-content"
              aria-label={mobileTopbarOpen ? "Collapse controls" : "Expand controls"}
            >
              {mobileTopbarOpen ? "Close" : "Menu"}
            </button>
          </div>
        </div>

        <div id="mc-topbar-content" className={"mc-topbar-content " + (mobileTopbarOpen ? "open" : "")}>
          <div className="mc-topbar-row mc-topbar-workspace">
            <select
              className="mc-input mc-topbar-select"
              value={workspace.slug}
              onChange={(e) => {
                const slug = e.target.value;
                window.localStorage.setItem("mc:lastWorkspaceSlug", slug);
                setMobileTopbarOpen(false);
                router.push(`/w/${slug}`);
              }}
              aria-label="Workspace"
            >
              {(workspaces ?? []).map((w) => (
                <option key={w._id} value={w.slug}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mc-topbar-row mc-topbar-metrics">
            <div className="mc-stat-inline">
              <span className="mc-stat-inline-value">{activeAgents}</span>
              <span className="mc-stat-inline-label">agents</span>
            </div>
            <span className="mc-topbar-sep" aria-hidden />
            <div className="mc-stat-inline">
              <span className="mc-stat-inline-value">{totalTasks}</span>
              <span className="mc-stat-inline-label">tasks</span>
            </div>
            <span className="mc-topbar-sep" aria-hidden />
            <div className="mc-stat-inline">
              <span className="mc-stat-inline-value">{visibleTaskCount}</span>
              <span className="mc-stat-inline-label">visible</span>
            </div>
          </div>

          <div className="mc-topbar-row mc-topbar-actions">
            <Link
              className="mc-topbar-link"
              href={`/w/${workspace.slug}/agents`}
              onClick={() => setMobileTopbarOpen(false)}
            >
              Agents
            </Link>
            <Link
              className="mc-topbar-link"
              href="/workspaces"
              onClick={() => setMobileTopbarOpen(false)}
            >
              Workspaces
            </Link>
            <span className="mc-topbar-sep" aria-hidden />
            <div className="mc-topbar-time">
              <span className="mc-topbar-time-value">
                {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="mc-topbar-time-date">
                {now.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "2-digit",
                })}
              </span>
            </div>
            <span className="mc-topbar-sep" aria-hidden />
            <span className="mc-topbar-notif">
              {undeliveredTotal ?? 0}
            </span>
            <div className="mc-online">Online</div>
          </div>
        </div>
      </header>

      {/* Main grid */}
      <div className="mc-grid">
        {/* Agents */}
        <aside className="mc-panel mc-panel-agents">
          <div className="mc-panel-header">
            <div className="flex items-center gap-2">
              <span className="mc-dot muted" aria-hidden />
              <div className="mc-panel-title">Agents</div>
            </div>
            <Chip>{agents?.length ?? 0}</Chip>
          </div>
          <div className="mc-panel-body flex flex-col gap-2" aria-busy={agentsLoading}>
            {agentsLoading ? (
              <>
                <SkeletonAgentCard />
                <SkeletonAgentCard />
                <SkeletonAgentCard />
              </>
            ) : (agents ?? []).length ? (
              (agents ?? []).slice(0, 9).map((a) => (
                <AgentCard
                  key={a._id}
                  name={a.name}
                  role={a.role}
                  level={a.level}
                  rawStatus={a.status}
                  status={a.status === "active" ? "Working" : a.status === "blocked" ? "Blocked" : "Idle"}
                />
              ))
            ) : (
              <PanelState
                kind="empty"
                title="No agents yet"
                description="Add agents from the Agents page to start assigning work."
                icon="agent"
              />
            )}
          </div>
        </aside>

        {/* Mission Queue */}
        <section id="mc-mission-queue" className="mc-panel mc-panel-wide mc-panel-queue">
          <div className="mc-panel-header mc-panel-header-wrap">
            <div className="flex items-center gap-2">
              <span className="mc-dot amber" aria-hidden />
              <div className="mc-panel-title">Mission Queue</div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                className="mc-pill bg-zinc-900 text-white"
                type="button"
                onClick={() => setNewTaskOpen(true)}
              >
                + New Task
              </button>
              <Chip>{visibleTaskCount} visible</Chip>
              <Chip>{totalTasks} total</Chip>
            </div>
          </div>

          <div className="mc-panel-body mc-toolbar" role="search" aria-label="Task filters">
            <div className="mc-toolbar-grid">
              <label className="mc-form-row">
                <span className="mc-form-label">Search Tasks</span>
                <div className="mc-input-wrap">
                  <input
                    className="mc-input"
                    type="search"
                    placeholder="Search title, description, tags, assignee"
                    value={taskQuery}
                    onChange={(e) => setTaskQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setTaskQuery("");
                      }
                    }}
                    aria-label="Search tasks"
                  />
                  {taskQuery ? (
                    <button
                      className="mc-input-clear"
                      type="button"
                      onClick={() => setTaskQuery("")}
                      aria-label="Clear task search"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </label>
              <label className="mc-form-row">
                <span className="mc-form-label">Assignee</span>
                <select
                  className="mc-input"
                  value={taskAssigneeFilter}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "all" || value === "unassigned") {
                      setTaskAssigneeFilter(value);
                      return;
                    }
                    setTaskAssigneeFilter(value as Id<"agents">);
                  }}
                >
                  <option value="all">All assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {(agents ?? []).map((agent) => (
                    <option key={agent._id} value={agent._id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mc-toolbar-actions">
                <span className="mc-toolbar-hint">Tip: press Esc in search to clear quickly.</span>
              </div>
            </div>
            <div className="mc-toolbar-status" role="group" aria-label="Task status filters">
              <Pill active={taskStatusFilter === "all"} onClick={() => setTaskStatusFilter("all")}>
                All Statuses
              </Pill>
              {TASK_STATUS_META.map((status) => (
                <Pill
                  key={status.key}
                  active={taskStatusFilter === status.key}
                  onClick={() => setTaskStatusFilter(status.key)}
                >
                  {status.title}
                </Pill>
              ))}
            </div>
            {allTags.length > 0 && (
              <div className="mc-tag-filter" role="group" aria-label="Tag filters">
                <button
                  className={"mc-tag-pill " + (taskTagFilter === "all" ? "active" : "")}
                  type="button"
                  onClick={() => setTaskTagFilter("all")}
                  aria-pressed={taskTagFilter === "all"}
                >
                  All Tags
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    className={"mc-tag-pill " + (taskTagFilter === tag ? "active" : "")}
                    type="button"
                    onClick={() => setTaskTagFilter(tag)}
                    aria-pressed={taskTagFilter === tag}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-2">
              <label className="mc-form-row" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <span className="mc-form-label" style={{ marginBottom: 0 }}>Priority</span>
                <select
                  className="mc-input"
                  style={{ width: "auto", minWidth: 120 }}
                  value={taskPriorityFilter}
                  onChange={(e) => setTaskPriorityFilter(e.target.value)}
                >
                  <option value="all">All priorities</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="none">No priority</option>
                </select>
              </label>
            </div>

            <div className="mc-filter-feedback" aria-live="polite">
              <div className="mc-filter-feedback-text">{taskFilterSummary}</div>
              {hasTaskFilters ? (
                <button
                  className="mc-filter-inline"
                  type="button"
                  onClick={() => {
                    setTaskQuery("");
                    setTaskStatusFilter("all");
                    setTaskAssigneeFilter("all");
                    setTaskTagFilter("all");
                    setTaskPriorityFilter("all");
                  }}
                  aria-label={`Reset ${activeTaskFilterCount} active filter${activeTaskFilterCount !== 1 ? "s" : ""}`}
                >
                  Reset
                  <span className="mc-filter-count">{activeTaskFilterCount}</span>
                </button>
              ) : null}
            </div>
          </div>

          <div
            className="mc-kanban"
            tabIndex={0}
            aria-label="Kanban columns. Use Left and Right Arrow keys to scroll."
            aria-busy={tasksLoading}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const distance = e.key === "ArrowRight" ? 260 : -260;
              e.currentTarget.scrollBy({ left: distance, behavior: "smooth" });
            }}
          >
            <div className="sr-only" aria-live="polite">
              {a11yAnnouncement}
            </div>

            {tasksLoading ? (
              <>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="mc-column">
                    <div className="mc-column-header">
                      <div className="mc-skeleton-line" style={{ width: 80, height: 14 }} />
                      <div className="mc-skeleton-line" style={{ width: 24, height: 14 }} />
                    </div>
                    <div className="mc-column-body">
                      <SkeletonCard />
                      <SkeletonCard />
                    </div>
                  </div>
                ))}
              </>
            ) : (
              boardColumns.map((col, columnIndex) => {
                const isDragTarget = dragOverColumn === col.key;
                const keyboardTargetKey =
                  keyboardDrag ? TASK_STATUS_META[keyboardDrag.columnIndex]?.key : null;
                const isKeyboardTarget = keyboardTargetKey === col.key;

                return (
                  <div
                    key={col.key}
                    className={
                      "mc-column " +
                      (isDragTarget ? "mc-column-drop-target " : "") +
                      (isKeyboardTarget ? "mc-column-keyboard-target" : "")
                    }
                  >
                  <div className="mc-column-header">
                    <div className="flex items-center gap-2">
                      <span className="mc-dot muted" aria-hidden />
                      <div className="mc-column-title">{col.title}</div>
                    </div>
                    <span className="mc-count">
                      {col.visibleTasks.length}
                      {hasTaskFilters ? `/${col.totalCount}` : ""}
                    </span>
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
                        workspaceId: workspace._id,
                        id: taskId,
                        status: col.key,
                        fromHuman: true,
                        actorName: "Human",
                      });
                      setA11yAnnouncement(`Moved task to ${col.title}.`);
                    }}
                    aria-label={`${col.title} column`}
                  >
                    {col.visibleTasks.length ? (
                      col.visibleTasks.map((task) => (
                        <TaskCard
                          key={task._id}
                          id={task._id}
                          title={task.title}
                          description={task.description ?? ""}
                          tags={task.tags ?? []}
                          priority={(task as Record<string, unknown>).priority as string | undefined}
                          assignees={(task.assigneeIds ?? []).map((aid) => ({
                            name: agentNameById.get(aid) ?? "Agent",
                          }))}
                          updatedAgo={new Date(task.updatedAt).toLocaleDateString()}
                          draggable
                          isKeyboardDragging={keyboardDrag?.taskId === task._id}
                          onDragStart={() => {
                            setKeyboardDrag(null);
                            setA11yAnnouncement(`Dragging ${task.title}. Drop on a column to move.`);
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === "Escape") {
                              if (keyboardDrag?.taskId === task._id) {
                                e.preventDefault();
                                setKeyboardDrag(null);
                                setA11yAnnouncement("Cancelled move.");
                              }
                              return;
                            }

                            // Space picks up / drops. Enter drops.
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              if (!keyboardDrag || keyboardDrag.taskId !== task._id) {
                                setKeyboardDrag({ taskId: task._id, columnIndex });
                                setA11yAnnouncement(
                                  `Picked up ${task.title}. Use Left/Right arrows to choose a column, then press Enter to drop.`
                                );
                              } else {
                                const dest = TASK_STATUS_META[keyboardDrag.columnIndex] ?? TASK_STATUS_META[0];
                                await updateStatus({
                                  workspaceId: workspace._id,
                                  id: task._id,
                                  status: dest.key,
                                  fromHuman: true,
                                  actorName: "Human",
                                });
                                setKeyboardDrag(null);
                                setA11yAnnouncement(`Moved ${task.title} to ${dest.title}.`);
                              }
                              return;
                            }

                            if (keyboardDrag?.taskId === task._id) {
                              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                                e.preventDefault();
                                const delta = e.key === "ArrowLeft" ? -1 : 1;
                                setKeyboardDrag((cur) => {
                                  if (!cur) return cur;
                                  const nextIndex = Math.max(
                                    0,
                                    Math.min(TASK_STATUS_META.length - 1, cur.columnIndex + delta)
                                  );
                                  const nextCol = TASK_STATUS_META[nextIndex] ?? TASK_STATUS_META[0];
                                  setA11yAnnouncement(`Target column: ${nextCol.title}.`);
                                  return { ...cur, columnIndex: nextIndex };
                                });
                              }
                            }
                          }}
                          onClick={() => setSelectedTaskId(task._id)}
                        />
                      ))
                    ) : null}
                  </div>
                </div>
                );
              })
            )}
          </div>
        </section>

        {/* Live Feed */}
        <aside className="mc-panel mc-panel-feed">
          <div className="mc-panel-header">
            <div className="flex items-center gap-2">
              <span className="mc-dot green" aria-hidden />
              <div className="mc-panel-title">Live Feed</div>
            </div>
            <Chip>
              {filteredFeed.length}
              {hasFeedFilters ? `/${feedTotalCount}` : ""}
            </Chip>
          </div>

          <div
            className="mc-panel-body mc-feed-body"
            role="search"
            aria-label="Live feed filters"
            aria-busy={liveFeedLoading}
          >
            <label className="mc-form-row">
              <span className="mc-form-label">Search Feed</span>
              <div className="mc-input-wrap">
                <input
                  className="mc-input"
                  type="search"
                  placeholder="Search message, actor, or type"
                  value={feedQuery}
                  onChange={(e) => setFeedQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setFeedQuery("");
                    }
                  }}
                  aria-label="Search live feed"
                />
                {feedQuery ? (
                  <button
                    className="mc-input-clear"
                    type="button"
                    onClick={() => setFeedQuery("")}
                    aria-label="Clear live feed search"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </label>

            <div className="mc-segment" role="group" aria-label="Feed time window filters">
              {LIVE_FEED_WINDOWS.map((window) => (
                <Pill
                  key={window.key}
                  active={feedWindowFilter === window.key}
                  onClick={() => setFeedWindowFilter(window.key)}
                >
                  {window.label}
                </Pill>
              ))}
            </div>

            <div className="mc-segment" role="group" aria-label="Feed category filters">
              {LIVE_FEED_FILTERS.map((filter) => (
                <Pill
                  key={filter.key}
                  active={feedTypeFilter === filter.key}
                  onClick={() => setFeedTypeFilter(filter.key)}
                >
                  {filter.label}
                </Pill>
              ))}
            </div>

            <div className="mc-filter-row" role="group" aria-label="Feed agent filters">
              <button
                className={"mc-filter " + (feedAgentFilter === "all" ? "active" : "")}
                type="button"
                onClick={() => setFeedAgentFilter("all")}
                aria-pressed={feedAgentFilter === "all"}
              >
                All Agents
              </button>
              {(agents ?? []).slice(0, 9).map((agent) => (
                <button
                  key={agent._id}
                  className={"mc-filter " + (feedAgentFilter === agent._id ? "active" : "")}
                  type="button"
                  onClick={() => setFeedAgentFilter(agent._id)}
                  aria-pressed={feedAgentFilter === agent._id}
                >
                  {agent.name}
                </button>
              ))}
            </div>

            <div className="mc-filter-feedback" aria-live="polite">
              <div className="mc-filter-feedback-text">{feedFilterSummary}</div>
              {hasFeedFilters ? (
                <button
                  className="mc-filter-inline"
                  type="button"
                  onClick={() => {
                    setFeedQuery("");
                    setFeedTypeFilter("all");
                    setFeedWindowFilter("all");
                    setFeedAgentFilter("all");
                  }}
                  aria-label={`Clear ${activeFeedFilterCount} active filter${activeFeedFilterCount !== 1 ? "s" : ""}`}
                >
                  Clear filters
                  <span className="mc-filter-count">{activeFeedFilterCount}</span>
                </button>
              ) : null}
            </div>

            <div className="mc-feed-list">
              {liveFeedLoading ? (
                <>
                  <SkeletonFeedItem />
                  <SkeletonFeedItem />
                  <SkeletonFeedItem />
                  <SkeletonFeedItem />
                </>
              ) : filteredFeed.length ? (
                filteredFeed.map((entry) => {
                  const actor = (entry.agentId ? agentNameById.get(entry.agentId) : null) ?? "System";
                  const typeClass = entry.type.includes("heartbeat")
                    ? "mc-feed-type-heartbeat"
                    : entry.type.includes("status")
                      ? "mc-feed-type-status"
                      : "mc-feed-type-task";

                  return (
                    <div key={entry._id} className="mc-feed-item">
                      <div className="mc-feed-avatar" aria-hidden />
                      <div className="min-w-0">
                        <div className="mc-feed-meta">
                          {actor}
                          <span className={`mc-feed-type ${typeClass}`}>
                            {formatLiveFeedType(entry.type)}
                          </span>
                        </div>
                        <div className="mc-feed-message">{entry.message}</div>
                        <div className="mc-feed-time">
                          {new Date(entry.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <PanelState
                  kind="empty"
                  title={hasFeedFilters ? "No matching activity" : "No activity yet"}
                  description={
                    hasFeedFilters
                      ? "Adjust the feed filters or clear them to see more updates."
                      : "Task, comment, and status updates will appear in real time."
                  }
                  icon={hasFeedFilters ? "filter" : "feed"}
                />
              )}
            </div>
          </div>
        </aside>
      </div>

      <NewTaskModal
        open={newTaskOpen}
        workspaceId={workspace._id}
        onClose={() => setNewTaskOpen(false)}
        onCreated={(id) => setSelectedTaskId(id)}
      />

      <TaskDetailDrawer
        open={!!selectedTaskId}
        workspaceId={workspace._id}
        taskId={selectedTaskId}
        task={selectedTask}
        agents={agents ?? []}
        agentNameById={agentNameById}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}
