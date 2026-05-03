import { AdminSearchList } from "@/components/admin-search-list";
import { createAdminClient } from "@/lib/supabase/admin";

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
  arc_headline: string;
};

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

  let storiesByArticleId: Record<string, StoryRow> = {};
  if (articleIds.length > 0) {
    const { data: stories, error: storiesError } = await supabase
      .from("stories")
      .select("id,article_id,is_live,arc_headline")
      .in("article_id", articleIds);

    if (storiesError) {
      throw new Error(`Failed to load stories: ${storiesError.message}`);
    }

    storiesByArticleId = Object.fromEntries(
      ((stories ?? []) as StoryRow[]).map((story) => [story.article_id, story]),
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[#c8ff00]">Arc Editor</h1>
        <p className="mt-1 text-sm text-zinc-400">Articles → Arc drafts</p>

        <div className="mt-8">
          <AdminSearchList articles={articleRows} storiesByArticleId={storiesByArticleId} />
        </div>
      </div>
    </main>
  );
}
