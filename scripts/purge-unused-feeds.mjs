/**
 * Delete articles + unused feed rows for sources no longer in DEFAULT_FEEDS.
 * Preserves articles linked to stories (stories.article_id or story_articles).
 *
 * Run: node --env-file=.env.local scripts/purge-unused-feeds.mjs
 */
import { createClient } from "@supabase/supabase-js";

const ACTIVE_URLS = new Set([
  "https://feeds.npr.org/1001/rss.xml",
  "https://rss.politico.com/politics-news.xml",
  "https://thehill.com/feed/",
  "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
  "https://feeds.washingtonpost.com/rss/politics",
  "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "https://feeds.bloomberg.com/markets/news.rss",
  "https://www.forbes.com/business/feed/",
  "https://techcrunch.com/feed/",
  "https://www.theverge.com/rss/index.xml",
  "https://www.wired.com/feed/rss",
  "https://feeds.arstechnica.com/arstechnica/index",
  "https://www.theguardian.com/us/rss",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
]);

const PAGE = 1000;
const IN_CHUNK = 150;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, key);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAllArticlesForFeeds(feedIds) {
  const rows = [];
  for (const feedChunk of chunk(feedIds, IN_CHUNK)) {
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("articles")
        .select("id, title, feed_id")
        .in("feed_id", feedChunk)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const batch = data ?? [];
      rows.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
  }
  return rows;
}

async function collectProtectedIds(articleIds) {
  const protectedIds = new Set();
  for (const ids of chunk(articleIds, IN_CHUNK)) {
    const { data: stories, error: stErr } = await supabase
      .from("stories")
      .select("article_id")
      .in("article_id", ids);
    if (stErr) throw new Error(stErr.message);
    for (const s of stories ?? []) {
      if (s.article_id) protectedIds.add(s.article_id);
    }

    const { data: links, error: linkErr } = await supabase
      .from("story_articles")
      .select("article_id")
      .in("article_id", ids);
    if (linkErr) throw new Error(linkErr.message);
    for (const l of links ?? []) {
      if (l.article_id) protectedIds.add(l.article_id);
    }
  }
  return protectedIds;
}

const { data: feeds, error: feedErr } = await supabase
  .from("feeds")
  .select("id, source_name, url");

if (feedErr) {
  console.error(feedErr.message);
  process.exit(1);
}

const unusedFeeds = (feeds ?? []).filter((f) => !ACTIVE_URLS.has(f.url));
console.log(`Unused feeds: ${unusedFeeds.length}`);
for (const f of unusedFeeds) {
  console.log(`  - ${f.source_name} | ${f.url}`);
}

if (unusedFeeds.length === 0) {
  console.log("Nothing to purge.");
  process.exit(0);
}

const unusedIds = unusedFeeds.map((f) => f.id);

let rows;
try {
  rows = await fetchAllArticlesForFeeds(unusedIds);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

console.log(`Articles on unused feeds: ${rows.length}`);

const articleIds = rows.map((a) => a.id);
let protectedIds;
try {
  protectedIds = await collectProtectedIds(articleIds);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const skipped = rows.filter((a) => protectedIds.has(a.id));
const toDelete = rows.filter((a) => !protectedIds.has(a.id));

console.log(`\nProtected (linked to stories): ${skipped.length}`);
for (const s of skipped) {
  console.log(`  SKIP ${s.id} | ${(s.title || "").slice(0, 90)}`);
}

console.log(`\nDeleting articles: ${toDelete.length}`);
let deleted = 0;
const deleteIds = toDelete.map((a) => a.id);
for (const chunkIds of chunk(deleteIds, IN_CHUNK)) {
  await supabase.from("story_articles").delete().in("article_id", chunkIds);
  const { error: delErr, count } = await supabase
    .from("articles")
    .delete({ count: "exact" })
    .in("id", chunkIds);
  if (delErr) {
    console.error("Delete failed:", delErr.message);
    process.exit(1);
  }
  deleted += count ?? chunkIds.length;
}

const feedsWithProtected = new Set(
  skipped.map((s) => s.feed_id).filter(Boolean),
);
const feedsToDelete = unusedFeeds.filter((f) => !feedsWithProtected.has(f.id));

console.log(`\nDeleting unused feed rows: ${feedsToDelete.length}`);
if (feedsToDelete.length > 0) {
  const { error: feedDelErr } = await supabase
    .from("feeds")
    .delete()
    .in(
      "id",
      feedsToDelete.map((f) => f.id),
    );
  if (feedDelErr) {
    console.error("Feed delete failed:", feedDelErr.message);
    process.exit(1);
  }
}

const { count: remaining } = await supabase
  .from("articles")
  .select("id", { count: "exact", head: true });

console.log(`\nDeleted articles: ${deleted}`);
console.log(`Skipped (story-linked): ${skipped.length}`);
console.log(`Articles remaining in DB: ${remaining ?? "?"}`);
console.log(
  `Feeds kept (had protected articles): ${unusedFeeds.length - feedsToDelete.length}`,
);
