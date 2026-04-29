import { createClient } from "@/lib/supabase/server";

export type ArticleWithSource = {
  id: string;
  title: string;
  link: string;
  summary: string | null;
  image_url: string | null;
  author: string | null;
  category: string;
  published_at: string | null;
  feeds: { source_name: string; category: string } | null;
};

export async function getArticlesForTab(
  tab: string,
): Promise<ArticleWithSource[]> {
  if (
    tab === "clips" ||
    tab === "verify" ||
    tab === "topics" ||
    tab === "you"
  ) {
    return [];
  }

  const supabase = await createClient();

  let query = supabase
    .from("articles")
    .select(
      "id, title, link, summary, image_url, author, category, published_at, feeds(source_name, category)",
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(40);

  if (tab !== "today") {
    query = query.eq("category", tab);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[articles]", error.message);
    return [];
  }

  const rows = data ?? [];
  return rows.map((row) => {
    const f = row.feeds;
    const feed =
      f && !Array.isArray(f)
        ? f
        : Array.isArray(f) && f[0]
          ? f[0]
          : null;
    return {
      ...row,
      feeds: feed,
    } as ArticleWithSource;
  });
}
