"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ArchiveDraftButton({ storyId }: { storyId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archive = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/stories/${encodeURIComponent(storyId)}/archive`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Archive failed",
        );
      }
      router.push("/admin");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Archive failed");
      setPending(false);
    }
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => void archive()}
        disabled={pending}
        className="rounded-full border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
      >
        {pending ? "Archiving…" : "Archive draft"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
