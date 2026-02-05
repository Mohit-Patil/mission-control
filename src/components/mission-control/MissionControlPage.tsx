import { agents, columns, liveFeed } from "@/components/mission-control/mock-data";

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
}: {
  title: string;
  description: string;
  tags: string[];
  assignees?: { name: string }[];
  updatedAgo: string;
}) {
  return (
    <div className="mc-card">
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
    </div>
  );
}

export function MissionControlPage() {
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
            <Chip>12</Chip>
          </div>
          <div className="mc-panel-body flex flex-col gap-2">
            {agents.slice(0, 9).map((a) => (
              <AgentCard
                key={a.id}
                name={a.name}
                role={a.role}
                level={a.level}
                status={a.status}
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
                  <span className="mc-count">{col.count}</span>
                </div>
                <div className="mc-column-body">
                  {col.tasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      title={t.title}
                      description={t.description}
                      tags={t.tags}
                      assignees={t.assignees}
                      updatedAgo={t.updatedAgo}
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
                <div key={e.id} className="mc-feed-item">
                  <div className="mc-feed-avatar" aria-hidden />
                  <div className="min-w-0">
                    <div className="text-[12px] text-zinc-800">
                      <span className="font-semibold">{e.who}</span> {e.action} {e.what}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                      {e.when}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
