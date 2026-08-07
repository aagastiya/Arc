import { AdminNav } from "@/components/admin-nav";
import {
  AdminSearchList,
  type AdminArticleRow,
  type AdminStoryRow,
} from "@/components/admin-search-list";
import { SyncNewsButton } from "@/components/sync-news-button";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminStoriesPage() {
  const supabase = createAdminClient();

  const { data: articles, error: articlesError } = await supabase
    .from("articles")
    .select("id,title,category,published_at,feeds(source_name)")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (articlesError) {
    throw new Error(`Failed to load articles: ${articlesError.message}`);
  }

  const articleRows = (articles ?? []) as unknown as AdminArticleRow[];
  const articleById = new Map(articleRows.map((a) => [a.id, a]));

  const { data: archivedStories, error: archivedErr } = await supabase
    .from("stories")
    .select(
      "id,article_id,is_live,arc_headline,arc_summary,published_at,archived_at,verification",
    )
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(100);

  if (archivedErr) {
    throw new Error(`Failed to load archived stories: ${archivedErr.message}`);
  }

  const missingArticleIds = [
    ...new Set(
      ((archivedStories ?? []) as AdminStoryRow[])
        .map((s) => s.article_id)
        .filter((id) => !articleById.has(id)),
    ),
  ];

  if (missingArticleIds.length > 0) {
    const { data: extraArticles, error: extraErr } = await supabase
      .from("articles")
      .select("id,title,category,published_at,feeds(source_name)")
      .in("id", missingArticleIds);
    if (extraErr) {
      throw new Error(`Failed to load archived articles: ${extraErr.message}`);
    }
    for (const row of (extraArticles ?? []) as unknown as AdminArticleRow[]) {
      articleById.set(row.id, row);
    }
  }

  const allArticleIds = [...articleById.keys()];
  let storiesByArticleId: Record<string, AdminStoryRow> = {};
  if (allArticleIds.length > 0) {
    const { data: stories, error: storiesError } = await supabase
      .from("stories")
      .select(
        "id,article_id,is_live,arc_headline,arc_summary,published_at,archived_at,verification",
      )
      .in("article_id", allArticleIds);

    if (storiesError) {
      throw new Error(`Failed to load stories: ${storiesError.message}`);
    }

    storiesByArticleId = Object.fromEntries(
      ((stories ?? []) as AdminStoryRow[]).map((story) => [
        story.article_id,
        story,
      ]),
    );
  }

  const mergedArticles = [
    ...articleRows,
    ...[...articleById.values()].filter(
      (a) => !articleRows.some((r) => r.id === a.id),
    ),
  ];

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Stories
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Search articles and drafts — the desk lives at{" "}
              <a href="/admin" className="text-zinc-200 underline">
                /admin
              </a>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AdminNav current="/admin/stories" />
            <SyncNewsButton />
          </div>
        </div>

        <div className="mt-8">
          <AdminSearchList
            articles={mergedArticles}
            storiesByArticleId={storiesByArticleId}
          />
        </div>
      </div>
    </main>
  );
}
