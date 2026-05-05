"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatRelativeTime } from "@/lib/time";

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
};

type Props = {
  articles: AdminArticleRow[];
  storiesByArticleId: Record<string, AdminStoryRow>;
};

function getStatus(story: AdminStoryRow | undefined) {
  if (!story) {
    return {
      label: "No draft",
      className: "border-zinc-600 text-zinc-300",
    };
  }

  if (story.is_live) {
    return {
      label: "Live",
      className: "border-[#c8ff00] text-[#c8ff00]",
    };
  }

  return {
    label: "Draft ready",
    className: "border-green-500 text-green-300",
  };
}

export function AdminSearchList({ articles, storiesByArticleId }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    articles: AdminArticleRow[];
    storiesByArticleId: Record<string, AdminStoryRow>;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingByArticleId, setLoadingByArticleId] = useState<Record<string, boolean>>({});
  const [errorByArticleId, setErrorByArticleId] = useState<Record<string, string | null>>({});

  const handleGenerateClick = async (articleId: string) => {
    setLoadingByArticleId((prev) => ({ ...prev, [articleId]: true }));
    setErrorByArticleId((prev) => ({ ...prev, [articleId]: null }));

    try {
      const res = await fetch(`/api/arc/generate?id=${encodeURIComponent(articleId)}`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved_story?: { id?: string };
      };

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to generate Arc voice draft.",
        );
      }

      const savedStoryId = data.saved_story?.id;
      if (savedStoryId) {
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

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search-articles?q=${encodeURIComponent(q)}`);
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          throw new Error("bad status");
        }
        const data = (await res.json()) as {
          articles?: AdminArticleRow[];
          storiesByArticleId?: Record<string, AdminStoryRow>;
          error?: string;
        };
        if (data.error) {
          throw new Error(data.error);
        }
        setSearchResults({
          articles: data.articles ?? [],
          storiesByArticleId: data.storiesByArticleId ?? {},
        });
      } catch {
        if (!cancelled) {
          setSearchError("Search failed, try again");
          setSearchResults(null);
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setSearching(false);
    };
  }, [query]);

  const isSearchMode = query.trim().length > 0;
  const displayArticles = isSearchMode ? (searchResults?.articles ?? []) : articles;
  const displayStories = isSearchMode ? (searchResults?.storiesByArticleId ?? {}) : storiesByArticleId;

  const showSearchingRow = isSearchMode && searching && searchResults === null && !searchError;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by headline..."
          className="min-w-[200px] flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 text-zinc-100 placeholder-zinc-500 focus:border-[#c8ff00] focus:outline-none"
        />
        {isSearchMode && searching ? (
          <span className="text-xs text-zinc-500">Searching...</span>
        ) : null}
      </div>

      {searchError ? (
        <p className="mb-3 text-sm text-red-400">{searchError}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-3">Article</th>
              <th className="px-4 py-3">Source / Category</th>
              <th className="px-4 py-3">Published</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-[#0f0f0f]">
            {showSearchingRow ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-500">
                  Searching...
                </td>
              </tr>
            ) : displayArticles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-500">
                  No articles match your search.
                </td>
              </tr>
            ) : (
              displayArticles.map((article) => {
                const story = displayStories[article.id];
                const status = getStatus(story);
                const sourceName = article.feeds?.source_name ?? "Unknown source";
                const category = article.category ?? "uncategorized";
                const published = formatRelativeTime(article.published_at) || "Unknown";

                return (
                  <tr key={article.id} className="align-top hover:bg-zinc-900/50">
                    <td className="px-4 py-3">
                      {story ? (
                        <Link
                          href={`/admin/${story.id}`}
                          className="max-w-2xl leading-5 text-zinc-100 hover:text-[#c8ff00] hover:underline"
                        >
                          {article.title}
                        </Link>
                      ) : (
                        <p className="max-w-2xl leading-5 text-zinc-100">{article.title}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {sourceName}
                      <span className="mx-2 text-zinc-600">•</span>
                      <span className="capitalize">{category}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-400">{published}</td>
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
                        {errorByArticleId[article.id] ? (
                          <p className="text-xs text-red-400">{errorByArticleId[article.id]}</p>
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
