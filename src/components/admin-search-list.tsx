"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AdminStoryDates } from "@/components/admin-story-dates";
import {
  isFlaggedVerification,
  parseVerification,
} from "@/lib/arc/verification";

export type AdminArticleRow = {
  id: string;
  title: string;
  category: string | null;
  published_at: string | null;
  feeds: { source_name: string | null } | null;
};

export type AdminStoryRow = {
  id: string;
  article_id: string;
  is_live: boolean;
  arc_headline: string;
  arc_summary: string;
  published_at: string | null;
  archived_at: string | null;
  verification: unknown;
};

type QuickFilter = "all" | "drafts" | "live" | "flagged" | "archived";

type Props = {
  articles: AdminArticleRow[];
  storiesByArticleId: Record<string, AdminStoryRow>;
};

const FILTERS: Array<{ key: QuickFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "live", label: "Live" },
  { key: "flagged", label: "Flagged" },
  { key: "archived", label: "Archived" },
];

function getStatus(story: AdminStoryRow | undefined) {
  if (!story) {
    return {
      label: "No draft",
      className: "border-zinc-600 text-zinc-300",
    };
  }

  if (story.archived_at) {
    return {
      label: "Archived",
      className: "border-amber-500/50 text-amber-300",
    };
  }

  if (story.is_live) {
    return {
      label: "Live",
      className: "border-[#c8ff00] text-[#c8ff00]",
    };
  }

  if (isFlaggedVerification(parseVerification(story.verification))) {
    return {
      label: "Flagged",
      className: "border-amber-500/50 text-amber-300",
    };
  }

  return {
    label: "Draft ready",
    className: "border-green-500 text-green-300",
  };
}

function matchesText(
  article: AdminArticleRow,
  story: AdminStoryRow | undefined,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    article.title,
    story?.arc_headline ?? "",
    story?.arc_summary ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function matchesFilter(
  story: AdminStoryRow | undefined,
  filter: QuickFilter,
): boolean {
  if (filter === "all") return true;
  if (!story) return false;
  if (filter === "archived") return story.archived_at !== null;
  if (story.archived_at) return false;
  if (filter === "drafts") return !story.is_live;
  if (filter === "live") return story.is_live;
  if (filter === "flagged") {
    return isFlaggedVerification(parseVerification(story.verification));
  }
  return true;
}

export function AdminSearchList({ articles, storiesByArticleId }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QuickFilter>("all");
  const [loadingByArticleId, setLoadingByArticleId] = useState<
    Record<string, boolean>
  >({});
  const [errorByArticleId, setErrorByArticleId] = useState<
    Record<string, string | null>
  >({});
  const [thinWarningByArticleId, setThinWarningByArticleId] = useState<
    Record<string, string | null>
  >({});

  const handleGenerateClick = async (articleId: string) => {
    setLoadingByArticleId((prev) => ({ ...prev, [articleId]: true }));
    setErrorByArticleId((prev) => ({ ...prev, [articleId]: null }));
    setThinWarningByArticleId((prev) => ({ ...prev, [articleId]: null }));

    try {
      const res = await fetch(
        `/api/arc/generate?id=${encodeURIComponent(articleId)}`,
        {
          method: "POST",
          credentials: "same-origin",
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved_story?: { id?: string };
        source_quality?: Array<{ quality: string; text_length?: number }>;
      };

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to generate Arc voice draft.",
        );
      }

      const qualities = data.source_quality ?? [];
      const allThin =
        qualities.length > 0 && qualities.every((q) => q.quality === "thin");
      if (allThin) {
        setThinWarningByArticleId((prev) => ({
          ...prev,
          [articleId]: "Source text is thin — story will be short.",
        }));
      }

      const savedStoryId = data.saved_story?.id;
      if (savedStoryId) {
        if (allThin) {
          await new Promise((r) => setTimeout(r, 900));
        }
        router.push(`/admin/${savedStoryId}`);
        return;
      }

      throw new Error("Story created, but no story id was returned.");
    } catch (err) {
      setErrorByArticleId((prev) => ({
        ...prev,
        [articleId]: err instanceof Error ? err.message : "Unexpected error",
      }));
    } finally {
      setLoadingByArticleId((prev) => ({ ...prev, [articleId]: false }));
    }
  };

  const displayArticles = useMemo(() => {
    return articles.filter((article) => {
      const story = storiesByArticleId[article.id];
      return (
        matchesFilter(story, filter) && matchesText(article, story, query)
      );
    });
  }, [articles, storiesByArticleId, filter, query]);

  const counts = useMemo(() => {
    const result: Record<QuickFilter, number> = {
      all: articles.length,
      drafts: 0,
      live: 0,
      flagged: 0,
      archived: 0,
    };
    for (const article of articles) {
      const story = storiesByArticleId[article.id];
      if (!story) continue;
      if (story.archived_at) {
        result.archived += 1;
        continue;
      }
      if (story.is_live) result.live += 1;
      else result.drafts += 1;
      if (isFlaggedVerification(parseVerification(story.verification))) {
        result.flagged += 1;
      }
    }
    return result;
  }, [articles, storiesByArticleId]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              filter === f.key
                ? "bg-[#c8ff00] text-black"
                : "border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            }`}
          >
            {f.label} {counts[f.key]}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by headline or standfirst…"
          className="min-w-[200px] flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 text-zinc-100 placeholder-zinc-500 focus:border-[#c8ff00] focus:outline-none"
        />
        {query.trim() || filter !== "all" ? (
          <span className="text-xs text-zinc-500">
            {displayArticles.length} shown
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-3">Article</th>
              <th className="px-4 py-3">Source / Category</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-[var(--card)]">
            {displayArticles.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-zinc-500"
                >
                  No stories match.
                </td>
              </tr>
            ) : (
              displayArticles.map((article) => {
                const story = storiesByArticleId[article.id];
                const status = getStatus(story);
                const sourceName =
                  article.feeds?.source_name ?? "Unknown source";
                const category = article.category ?? "uncategorized";

                return (
                  <tr
                    key={article.id}
                    className="align-top hover:bg-zinc-900/50"
                  >
                    <td className="px-4 py-3">
                      {story ? (
                        <Link
                          href={`/admin/${story.id}`}
                          className="max-w-2xl leading-5 text-zinc-100 hover:text-[#c8ff00] hover:underline"
                        >
                          {story.arc_headline || article.title}
                        </Link>
                      ) : (
                        <p className="max-w-2xl leading-5 text-zinc-100">
                          {article.title}
                        </p>
                      )}
                      {story?.arc_summary ? (
                        <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500 line-clamp-2">
                          {story.arc_summary}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {sourceName}
                      <span className="mx-2 text-zinc-600">•</span>
                      <span className="capitalize">{category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <AdminStoryDates
                        newestSourceAt={article.published_at}
                        publishedAt={story?.published_at ?? null}
                        isDraft={Boolean(story) && !story.is_live}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleGenerateClick(article.id)}
                          disabled={Boolean(loadingByArticleId[article.id])}
                          className="rounded border border-[#c8ff00]/50 px-3 py-1 text-xs font-semibold text-[#c8ff00] transition hover:border-[#c8ff00] hover:bg-[#c8ff00]/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loadingByArticleId[article.id]
                            ? "Generating..."
                            : story
                              ? "Regenerate"
                              : "Generate Arc voice"}
                        </button>
                        {thinWarningByArticleId[article.id] ? (
                          <p className="max-w-[14rem] text-right text-xs text-amber-400">
                            {thinWarningByArticleId[article.id]}
                          </p>
                        ) : null}
                        {errorByArticleId[article.id] ? (
                          <p className="text-xs text-red-400">
                            {errorByArticleId[article.id]}
                          </p>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
