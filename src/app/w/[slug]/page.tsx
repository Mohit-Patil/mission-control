"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { MissionControlPage } from "@/components/mission-control/MissionControlPage";

export default function WorkspaceDashboardPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const workspace = useQuery(api.workspaces.getBySlug, { slug });

  useEffect(() => {
    if (!workspace) return;
    window.localStorage.setItem("mc:lastWorkspaceSlug", workspace.slug);
  }, [workspace]);

  if (workspace === undefined) {
    return <div className="p-6 text-[12px] text-zinc-600">Loading…</div>;
  }

  if (workspace === null) {
    return (
      <div className="p-8">
        <div className="text-[14px] font-semibold text-zinc-900">Workspace not found</div>
        <div className="mt-2 text-[12px] text-zinc-600">No workspace with slug “{slug}”.</div>
        <div className="mt-4">
          <Link className="mc-pill bg-zinc-900 text-white" href="/workspaces">
            Go to workspaces
          </Link>
        </div>
      </div>
    );
  }

  return <MissionControlPage workspace={workspace} />;
}
