/**
 * One-off: archive drafts whose newest linked source article is older than 14 days.
 *
 * Run: npx tsx --env-file=.env.local scripts/archive-stale-drafts.ts
 */
import { createClient } from "@supabase/supabase-js";

import { ARCHIVE_STALE_DRAFT_MS } from "../src/lib/story-dates";

const PAGE = 200;
const IN_CHUNK = 80;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const cutoff = new Date(Date.now() - ARCHIVE_STALE_DRAFT_MS).toISOString();
  console.log(`Archiving drafts whose newest source is older than ${cutoff}\n`);

  const drafts: Array<{ id: string; article_id: string; arc_headline: string }> =
    [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("stories")
      .select("id,article_id,arc_headline")
      .eq("is_live", false)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    drafts.push(
      ...batch.map((row) => ({
        id: row.id as string,
        article_id: row.article_id as string,
        arc_headline: (row.arc_headline as string) ?? "(untitled)",
      })),
    );
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  console.log(`Open drafts: ${drafts.length}`);

  const newestByStory = new Map<string, string | null>();
  for (const ids of chunk(
    drafts.map((d) => d.id),
    IN_CHUNK,
  )) {
    if (ids.length === 0) continue;
    const { data: links, error } = await supabase
      .from("story_articles")
      .select("story_id,articles(published_at)")
      .in("story_id", ids);
    if (error) throw new Error(error.message);

    for (const row of links ?? []) {
      const storyId = row.story_id as string;
      const article = Array.isArray(row.articles) ? row.articles[0] : row.articles;
      const published =
        article && typeof article === "object"
          ? ((article as { published_at?: string | null }).published_at ?? null)
          : null;
      if (!published) continue;
      const current = newestByStory.get(storyId);
      if (!current || new Date(published) > new Date(current)) {
        newestByStory.set(storyId, published);
      }
    }
  }

  // Fallback to primary article when story_articles is empty.
  const missing = drafts.filter((d) => !newestByStory.has(d.id));
  for (const ids of chunk(
    missing.map((d) => d.article_id),
    IN_CHUNK,
  )) {
    if (ids.length === 0) continue;
    const { data: articles, error } = await supabase
      .from("articles")
      .select("id,published_at")
      .in("id", ids);
    if (error) throw new Error(error.message);
    const byId = new Map(
      (articles ?? []).map((a) => [
        a.id as string,
        (a.published_at as string | null) ?? null,
      ]),
    );
    for (const draft of missing) {
      if (newestByStory.has(draft.id)) continue;
      newestByStory.set(draft.id, byId.get(draft.article_id) ?? null);
    }
  }

  const toArchive = drafts.filter((d) => {
    const newest = newestByStory.get(d.id);
    if (!newest) return false;
    return new Date(newest).getTime() < new Date(cutoff).getTime();
  });

  console.log(`Eligible (newest source > 14d): ${toArchive.length}`);

  const archivedAt = new Date().toISOString();
  let archived = 0;
  for (const ids of chunk(
    toArchive.map((d) => d.id),
    IN_CHUNK,
  )) {
    if (ids.length === 0) continue;
    const { error, count } = await supabase
      .from("stories")
      .update({ archived_at: archivedAt, updated_at: archivedAt }, { count: "exact" })
      .in("id", ids)
      .eq("is_live", false)
      .is("archived_at", null);
    if (error) throw new Error(error.message);
    archived += count ?? ids.length;
  }

  for (const d of toArchive.slice(0, 40)) {
    console.log(
      `  - ${d.arc_headline.slice(0, 80)} (source ${newestByStory.get(d.id)})`,
    );
  }
  if (toArchive.length > 40) {
    console.log(`  … and ${toArchive.length - 40} more`);
  }

  console.log(`\nArchived: ${archived}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
