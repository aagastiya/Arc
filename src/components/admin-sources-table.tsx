"use client";

import { useState } from "react";

export type SourceFeedRow = {
  id: string;
  source_name: string;
  url: string;
  category: string;
  active: boolean;
  articles_last_7_days: number;
  newest_article_at: string | null;
  total_articles: number;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type CleanupResult = {
  articlesDeleted?: number;
  feedsDeleted?: number;
  articlesSkippedLinked?: number;
  cutoff?: string;
  error?: string;
};

export function AdminSourcesTable({ feeds }: { feeds: SourceFeedRow[] }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dead = feeds.filter((f) => !f.active).length;
  const active = feeds.length - dead;

  const runCleanup = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/cleanup", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as CleanupResult;
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Cleanup failed",
        );
      }
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          {feeds.length} feeds · {active} active ·{" "}
          <span className={dead > 0 ? "text-amber-300" : ""}>
            {dead} dead
          </span>
        </p>
        <button
          type="button"
          onClick={() => void runCleanup()}
          disabled={running}
          className="rounded-full border border-zinc-600 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-200 transition-colors hover:border-[#c8ff00] hover:text-[#c8ff00] disabled:opacity-50"
        >
          {running ? "Cleaning…" : "Run cleanup"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-400">{error}</p>
      ) : null}
      {result ? (
        <p className="mt-3 text-sm text-zinc-300">
          Deleted {result.articlesDeleted ?? 0} unlinked articles older than 14
          days · skipped {result.articlesSkippedLinked ?? 0} linked · removed{" "}
          {result.feedsDeleted ?? 0} empty dead feeds.
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-3">Feed</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last 7 days</th>
              <th className="px-4 py-3">Newest</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-[var(--card)]">
            {feeds.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-zinc-500"
                >
                  No feeds stored yet. Run a news sync.
                </td>
              </tr>
            ) : (
              feeds.map((feed) => (
                <tr
                  key={feed.id}
                  className={
                    feed.active
                      ? "align-top hover:bg-zinc-900/50"
                      : "align-top bg-amber-500/[0.04] hover:bg-amber-500/[0.07]"
                  }
                >
                  <td className="px-4 py-3">
                    <p
                      className={
                        feed.active
                          ? "font-medium text-zinc-100"
                          : "font-medium text-amber-100"
                      }
                    >
                      {feed.source_name}
                    </p>
                    <p className="mt-0.5 max-w-md truncate text-[11px] text-zinc-600">
                      {feed.url}
                    </p>
                  </td>
                  <td className="px-4 py-3 capitalize text-zinc-400">
                    {feed.category}
                  </td>
                  <td className="px-4 py-3">
                    {feed.active ? (
                      <span className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                        Dead
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-300">
                    {feed.articles_last_7_days}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                    {formatDate(feed.newest_article_at)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-300">
                    {feed.total_articles}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
