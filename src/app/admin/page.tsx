import Link from "next/link";

import { formatRelativeTime } from "@/lib/time";
import { createAdminClient } from "@/lib/supabase/admin";

import { GenerateArcButton } from "./generate-arc-button";

export const dynamic = "force-dynamic";

type ArticleRow = {
  id: string;
  title: string;
  category: string | null;
  published_at: string | null;
  feeds: { source_name: string | null } | null;
};

type StoryRow = {
  id: string;
  article_id: string;
  is_live: boolean;
};

function getStatus(story: StoryRow | undefined) {
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

export default async function AdminPage() {
  const supabase = createAdminClient();

  const { data: articles, error: articlesError } = await supabase
    .from("articles")
    .select("id,title,category,published_at,feeds(source_name)")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (articlesError) {
    throw new Error(`Failed to load articles: ${articlesError.message}`);
  }

  const articleRows = (articles ?? []) as unknown as ArticleRow[];
  const articleIds = articleRows.map((article) => article.id);

  let storiesByArticleId = new Map<string, StoryRow>();
  if (articleIds.length > 0) {
    const { data: stories, error: storiesError } = await supabase
      .from("stories")
      .select("id,article_id,is_live")
      .in("article_id", articleIds);

    if (storiesError) {
      throw new Error(`Failed to load stories: ${storiesError.message}`);
    }

    storiesByArticleId = new Map(
      ((stories ?? []) as StoryRow[]).map((story) => [story.article_id, story]),
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[#c8ff00]">Arc Editor</h1>
        <p className="mt-1 text-sm text-zinc-400">Articles → Arc drafts</p>

        <div className="mt-8 overflow-x-auto rounded-lg border border-zinc-800">
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
              {articleRows.map((article) => {
                const story = storiesByArticleId.get(article.id);
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
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
