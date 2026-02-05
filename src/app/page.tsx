"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";

export default function Home() {
  const router = useRouter();
  const workspaces = useQuery(api.workspaces.list);

  useEffect(() => {
    if (!workspaces) return;

    if (workspaces.length === 0) {
      router.replace("/workspaces");
      return;
    }

    const last = typeof window !== "undefined" ? window.localStorage.getItem("mc:lastWorkspaceSlug") : null;
    const preferred = last && workspaces.find((w) => w.slug === last) ? last : workspaces[0]!.slug;
    router.replace(`/w/${preferred}`);
  }, [router, workspaces]);

  return (
    <div className="p-6 text-[12px] text-zinc-600">
      Loading…
    </div>
  );
}
