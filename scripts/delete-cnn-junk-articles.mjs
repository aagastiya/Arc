/**
 * One-off: delete CNN World junk articles not linked to any story.
 * Run: node --env-file=.env.local scripts/delete-cnn-junk-articles.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: feeds, error: feedErr } = await supabase
  .from("feeds")
  .select("id, source_name, url")
  .or("source_name.ilike.%CNN%,url.ilike.%cnn.com%");

if (feedErr) {
  console.error("Feed lookup failed:", feedErr.message);
  process.exit(1);
}

const cnnFeeds = (feeds ?? []).filter(
  (f) =>
    /cnn/i.test(f.source_name ?? "") ||
    /cnn\.com/i.test(f.url ?? "") ||
    /rss\.cnn\.com/i.test(f.url ?? ""),
);

if (cnnFeeds.length === 0) {
  console.log("No CNN feeds found. Nothing to delete.");
  process.exit(0);
}

console.log(
  "CNN feeds:",
  cnnFeeds.map((f) => `${f.source_name} (${f.id})`).join("; "),
);

const feedIds = cnnFeeds.map((f) => f.id);

const { data: articles, error: artErr } = await supabase
  .from("articles")
  .select("id, title, link")
  .in("feed_id", feedIds);

if (artErr) {
  console.error("Article lookup failed:", artErr.message);
  process.exit(1);
}

const rows = articles ?? [];
console.log(`CNN articles found: ${rows.length}`);

if (rows.length === 0) {
  process.exit(0);
}

const articleIds = rows.map((a) => a.id);

const { data: stories, error: stErr } = await supabase
  .from("stories")
  .select("id, article_id, is_live, arc_headline")
  .in("article_id", articleIds);

if (stErr) {
  console.error("Stories lookup failed:", stErr.message);
  process.exit(1);
}

const { data: links, error: linkErr } = await supabase
  .from("story_articles")
  .select("story_id, article_id")
  .in("article_id", articleIds);

if (linkErr) {
  console.error("story_articles lookup failed:", linkErr.message);
  process.exit(1);
}

const protectedIds = new Set([
  ...(stories ?? []).map((s) => s.article_id),
  ...(links ?? []).map((l) => l.article_id),
]);

const skipped = rows.filter((a) => protectedIds.has(a.id));
const toDelete = rows.filter((a) => !protectedIds.has(a.id));

console.log(`Protected (linked to stories): ${skipped.length}`);
for (const s of skipped) {
  const story = (stories ?? []).find((st) => st.article_id === s.id);
  console.log(
    `  SKIP ${s.id} | ${s.title.slice(0, 80)} | story=${story?.id ?? "via story_articles"} live=${story?.is_live ?? "?"}`,
  );
}

console.log(`Deleting: ${toDelete.length}`);
if (toDelete.length === 0) {
  process.exit(0);
}

const deleteIds = toDelete.map((a) => a.id);
const chunkSize = 100;
let deleted = 0;
for (let i = 0; i < deleteIds.length; i += chunkSize) {
  const chunk = deleteIds.slice(i, i + chunkSize);
  const { error: delErr, count } = await supabase
    .from("articles")
    .delete({ count: "exact" })
    .in("id", chunk);
  if (delErr) {
    console.error("Delete failed:", delErr.message);
    process.exit(1);
  }
  deleted += count ?? chunk.length;
}

console.log(`Deleted ${deleted} CNN articles.`);
