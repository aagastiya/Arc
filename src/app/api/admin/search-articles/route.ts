import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/** Strip ILIKE metacharacters so user input cannot widen the pattern. */
function sanitizeIlikeTerm(raw: string): string {
  return raw.replace(/[%_\\]/g, "");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("q")?.trim() ?? "";
  const term = sanitizeIlikeTerm(raw);

  if (!term) {
    return NextResponse.json({ articles: [], storiesByArticleId: {} });
  }

  const pattern = `%${term}%`;
  const admin = createAdminClient();

  const [{ data: titleMatches, error: titleErr }, { data: headlineStories, error: headlineErr }] =
    await Promise.all([
      admin
        .from("articles")
        .select("id")
        .ilike("title", pattern)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(200),
      admin.from("stories").select("article_id").ilike("arc_headline", pattern).limit(500),
    ]);

  if (titleErr) {
    return NextResponse.json({ error: titleErr.message }, { status: 500 });
  }
  if (headlineErr) {
    return NextResponse.json({ error: headlineErr.message }, { status: 500 });
  }

  const idSet = new Set<string>();
  for (const row of titleMatches ?? []) {
    idSet.add(row.id);
  }
  for (const row of headlineStories ?? []) {
    idSet.add(row.article_id);
  }

  const mergedIds = [...idSet];
  if (mergedIds.length === 0) {
    return NextResponse.json({ articles: [], storiesByArticleId: {} });
  }

  const { data: articles, error: articlesErr } = await admin
    .from("articles")
    .select("id,title,category,published_at,feeds(source_name)")
    .in("id", mergedIds)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (articlesErr || !articles) {
    return NextResponse.json(
      { error: articlesErr?.message ?? "article fetch failed" },
      { status: 500 },
    );
  }

  const articleIds = articles.map((a) => a.id);

  const { data: stories, error: storiesErr } = await admin
    .from("stories")
    .select("id,article_id,is_live,arc_headline")
    .in("article_id", articleIds);

  if (storiesErr) {
    return NextResponse.json({ error: storiesErr.message }, { status: 500 });
  }

  const storiesByArticleId = Object.fromEntries(
    (stories ?? []).map((story) => [story.article_id, story]),
  );

  return NextResponse.json({ articles, storiesByArticleId });
}
