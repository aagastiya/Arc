import { DEFAULT_FEEDS } from "@/config/feeds";
import { ARTICLE_RETENTION_MS } from "@/lib/story-dates";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE = 1000;
const IN_CHUNK = 150;

export type CleanupResult = {
  articlesDeleted: number;
  feedsDeleted: number;
  articlesSkippedLinked: number;
  cutoff: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function activeFeedUrls(): Set<string> {
  return new Set(DEFAULT_FEEDS.map((f) => f.url));
}

/**
 * Delete old unlinked articles, then empty dead feed rows.
 *
 * INVARIANT: never delete any article referenced in story_articles
 * (or stories.article_id), regardless of age. Linked source evidence
 * is part of the published record.
 */
export async function runArticleCleanup(): Promise<CleanupResult> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - ARTICLE_RETENTION_MS).toISOString();

  // --- 1. Collect old articles ---
  const oldArticles: Array<{ id: string; feed_id: string }> = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("articles")
      .select("id,feed_id")
      .lt("published_at", cutoff)
      .order("published_at", { ascending: true, nullsFirst: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to load old articles: ${error.message}`);
    const batch = data ?? [];
    oldArticles.push(
      ...batch.map((row) => ({
        id: row.id as string,
        feed_id: row.feed_id as string,
      })),
    );
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  // Also catch rows with null published_at that are old by created_at.
  {
    const { data, error } = await supabase
      .from("articles")
      .select("id,feed_id")
      .is("published_at", null)
      .lt("created_at", cutoff)
      .limit(PAGE);
    if (error) {
      throw new Error(`Failed to load undated old articles: ${error.message}`);
    }
    const seen = new Set(oldArticles.map((a) => a.id));
    for (const row of data ?? []) {
      const id = row.id as string;
      if (seen.has(id)) continue;
      oldArticles.push({ id, feed_id: row.feed_id as string });
    }
  }

  // --- 2. Protect anything linked to a story ---
  // INVARIANT: never delete any article referenced in story_articles,
  // regardless of age.
  const protectedIds = new Set<string>();
  for (const ids of chunk(
    oldArticles.map((a) => a.id),
    IN_CHUNK,
  )) {
    if (ids.length === 0) continue;

    const [{ data: links, error: linkErr }, { data: primaries, error: primErr }] =
      await Promise.all([
        supabase
          .from("story_articles")
          .select("article_id")
          .in("article_id", ids),
        supabase.from("stories").select("article_id").in("article_id", ids),
      ]);
    if (linkErr) {
      throw new Error(`story_articles protect failed: ${linkErr.message}`);
    }
    if (primErr) {
      throw new Error(`stories.article_id protect failed: ${primErr.message}`);
    }
    for (const row of links ?? []) {
      if (row.article_id) protectedIds.add(row.article_id as string);
    }
    for (const row of primaries ?? []) {
      if (row.article_id) protectedIds.add(row.article_id as string);
    }
  }

  const toDelete = oldArticles.filter((a) => !protectedIds.has(a.id));
  const articlesSkippedLinked = oldArticles.length - toDelete.length;

  let articlesDeleted = 0;
  for (const ids of chunk(
    toDelete.map((a) => a.id),
    IN_CHUNK,
  )) {
    if (ids.length === 0) continue;
    const { error, count } = await supabase
      .from("articles")
      .delete({ count: "exact" })
      .in("id", ids);
    if (error) throw new Error(`Article delete failed: ${error.message}`);
    articlesDeleted += count ?? ids.length;
  }

  // --- 3. Dead feeds with zero remaining articles ---
  const active = activeFeedUrls();
  const { data: feeds, error: feedErr } = await supabase
    .from("feeds")
    .select("id,url");
  if (feedErr) throw new Error(`Failed to load feeds: ${feedErr.message}`);

  const deadFeeds = (feeds ?? []).filter(
    (f) => !active.has(f.url as string),
  );

  let feedsDeleted = 0;
  for (const feed of deadFeeds) {
    const { count, error } = await supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("feed_id", feed.id as string);
    if (error) throw new Error(`Feed article count failed: ${error.message}`);
    if ((count ?? 0) > 0) continue;

    const { error: delErr } = await supabase
      .from("feeds")
      .delete()
      .eq("id", feed.id as string);
    if (delErr) throw new Error(`Feed delete failed: ${delErr.message}`);
    feedsDeleted += 1;
  }

  return {
    articlesDeleted,
    feedsDeleted,
    articlesSkippedLinked,
    cutoff,
  };
}
