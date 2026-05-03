"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { GenerateArcButton } from "@/app/admin/generate-arc-button";
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
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return articles;
    }
    return articles.filter((article) => {
      const story = storiesByArticleId[article.id];
      const title = (article.title ?? "").toLowerCase();
      const arc = (story?.arc_headline ?? "").toLowerCase();
      return title.includes(q) || arc.includes(q);
    });
  }, [articles, query, storiesByArticleId]);

  return (
    <>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by headline..."
        className="mb-4 w-full rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 text-zinc-100 placeholder-zinc-500 focus:border-[#c8ff00] focus:outline-none"
      />

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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-500">
                  No articles match your search.
                </td>
              </tr>
            ) : (
              filtered.map((article) => {
                const story = storiesByArticleId[article.id];
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
                      <GenerateArcButton articleId={article.id} hasDraft={Boolean(story)} />
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
