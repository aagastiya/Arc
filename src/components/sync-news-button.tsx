"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncFeedCount = {
  sourceName: string;
  articleUpserts: number;
};

type SyncResult = {
  feedsAttempted?: number;
  articleUpserts?: number;
  errors?: string[];
  perFeed?: SyncFeedCount[];
  error?: string;
  details?: string;
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
      const res = await fetch("/api/rss/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      const rawText = await res.text();
      let data: SyncResult = {};
      try {
        data = rawText ? (JSON.parse(rawText) as SyncResult) : {};
      } catch {
        setStatus({
          kind: "err",
          text: `Sync failed — HTTP ${res.status} (non-JSON response)`,
        });
        return;
      }

      if (!res.ok) {
        const detail =
          typeof data.error === "string"
            ? data.error
            : typeof data.details === "string"
              ? data.details
              : `HTTP ${res.status}`;
        setStatus({ kind: "err", text: `Sync failed — ${detail}` });
        return;
      }

      const count =
        typeof data.articleUpserts === "number" ? data.articleUpserts : 0;
      const feedErrors = Array.isArray(data.errors) ? data.errors.length : 0;
      const liveSkipped =
        typeof (data as { liveblogSkipped?: number }).liveblogSkipped === "number"
          ? (data as { liveblogSkipped: number }).liveblogSkipped
          : 0;
      const suffixParts: string[] = [];
      if (feedErrors > 0) {
        suffixParts.push(
          `${feedErrors} feed warning${feedErrors === 1 ? "" : "s"}`,
        );
      }
      if (liveSkipped > 0) {
        suffixParts.push(`${liveSkipped} liveblog skipped`);
      }
      const suffix =
        suffixParts.length > 0 ? ` (${suffixParts.join(", ")})` : "";
      setStatus({
        kind: "ok",
        text: `Synced: ${count} articles across ${data.feedsAttempted ?? "?"} feeds${suffix}`,
      });
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus({ kind: "err", text: `Sync failed — ${message}` });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex max-w-md flex-col items-end gap-2 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={() => {
          void handleClick();
        }}
        disabled={syncing}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {syncing ? "Syncing…" : "Sync news"}
      </button>
      {status ? (
        <p
          className={
            status.kind === "ok"
              ? "text-right text-sm text-zinc-400"
              : "text-right text-sm text-red-400"
          }
          role="status"
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
