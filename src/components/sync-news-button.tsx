"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncResult = {
  feedsAttempted?: number;
  articleUpserts?: number;
  errors?: string[];
  error?: string;
};

export function SyncNewsButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const handleClick = async () => {
    if (syncing) {
      return;
    }

    setSyncing(true);
    setStatus(null);

    try {
      const res = await fetch("/api/rss/sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as SyncResult;

      if (!res.ok) {
        const detail =
          typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
        setStatus({ kind: "err", text: `Sync failed — ${detail}` });
        return;
      }

      const count =
        typeof data.articleUpserts === "number" ? data.articleUpserts : 0;
      setStatus({ kind: "ok", text: `Synced: ${count} new articles` });
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus({ kind: "err", text: `Sync failed — ${message}` });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={syncing}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {syncing ? "Syncing…" : "Sync news"}
      </button>
      {status ? (
        <p
          className={
            status.kind === "ok"
              ? "text-sm text-zinc-400"
              : "text-sm text-red-400"
          }
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
