import Parser from "rss-parser";

import { DEFAULT_FEEDS } from "@/config/feeds";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractImageUrl } from "@/lib/rss/extract-image";
import { stripHtml } from "@/lib/rss/strip-html";

const parser = new Parser({
  timeout: 25_000,
  headers: {
    "User-Agent": "ArcRSS/1.0 (aggregator; +https://example.invalid)",
    Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  },
});

export type SyncFeedCount = {
  sourceName: string;
  url: string;
  articleUpserts: number;
  liveblogSkipped: number;
};

export type SyncResult = {
  feedsAttempted: number;
  articleUpserts: number;
  liveblogSkipped: number;
  errors: string[];
  perFeed: SyncFeedCount[];
};

/** Skip Guardian-style liveblogs and similar rolling coverage. */
export function isLiveblogItem(link: string, title: string): boolean {
  if (/\/live\//i.test(link)) {
    return true;
  }
  const t = title.toLowerCase();
  if (t.includes("– live") || t.includes("— live") || t.includes("- live")) {
    return true;
  }
  if (/\blive updates\b/i.test(title)) {
    return true;
  }
  return false;
}

/** Feeds are fetched in parallel; the pool keeps a wide source list off one slow origin. */
const FEED_CONCURRENCY = 6;
const UPSERT_CHUNK = 100;

type FeedOutcome = {
  count: SyncFeedCount;
  errors: string[];
};

type ArticleUpsert = {
  feed_id: string;
  item_guid: string;
  link: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  author: string | null;
  category: string;
  published_at: string | null;
};

async function syncOneFeed(
  admin: ReturnType<typeof createAdminClient>,
  def: (typeof DEFAULT_FEEDS)[number],
): Promise<FeedOutcome> {
  const errors: string[] = [];
  const count: SyncFeedCount = {
    sourceName: def.sourceName,
    url: def.url,
    articleUpserts: 0,
    liveblogSkipped: 0,
  };

  try {
    const { data: feedRow, error: feedErr } = await admin
      .from("feeds")
      .upsert(
        {
          url: def.url,
          source_name: def.sourceName,
          category: def.category,
          last_fetched_at: new Date().toISOString(),
        },
        { onConflict: "url" },
      )
      .select()
      .single();

    if (feedErr || !feedRow) {
      errors.push(`${def.url}: ${feedErr?.message ?? "feed upsert failed"}`);
      return { count, errors };
    }

    const parsed = await parser.parseURL(def.url);

    // Keyed by link: a feed that lists the same story twice would otherwise make
    // the batch upsert touch one row twice, which Postgres rejects. Guids are
    // unique per feed as well, and some feeds reuse them across items.
    const rows = new Map<string, ArticleUpsert>();
    const seenGuids = new Set<string>();

    for (const item of parsed.items) {
      if (!item.link?.trim() || !item.title?.trim()) {
        continue;
      }

      const link = item.link.trim();
      const title = item.title.trim();

      if (isLiveblogItem(link, title)) {
        count.liveblogSkipped += 1;
        continue;
      }

      const guid = String(item.guid || item.link);
      if (seenGuids.has(guid)) {
        continue;
      }
      seenGuids.add(guid);

      rows.set(link, {
        feed_id: feedRow.id as string,
        item_guid: guid,
        link,
        title,
        summary:
          item.contentSnippet?.trim() ||
          (item.content ? stripHtml(item.content) : null),
        image_url: extractImageUrl(item),
        author:
          typeof item.creator === "string"
            ? item.creator
            : typeof item.author === "string"
              ? item.author
              : null,
        category: def.category,
        published_at: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : null,
      });
    }

    const all = [...rows.values()];
    for (let i = 0; i < all.length; i += UPSERT_CHUNK) {
      const chunk = all.slice(i, i + UPSERT_CHUNK);
      const { error: artErr } = await admin
        .from("articles")
        .upsert(chunk, { onConflict: "link" });

      if (!artErr) {
        count.articleUpserts += chunk.length;
        continue;
      }

      // One bad row (usually a guid that already belongs to another link) must
      // not cost the whole batch, so fall back to writing the chunk row by row.
      for (const row of chunk) {
        const { error: rowErr } = await admin
          .from("articles")
          .upsert(row, { onConflict: "link" });
        if (rowErr) {
          errors.push(`${row.link}: ${rowErr.message}`);
        } else {
          count.articleUpserts += 1;
        }
      }
    }
  } catch (e) {
    errors.push(`${def.url}: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { count, errors };
}

export async function syncAllRssFeeds(): Promise<SyncResult> {
  const admin = createAdminClient();
  const outcomes = new Array<FeedOutcome>(DEFAULT_FEEDS.length);

  let next = 0;
  const worker = async () => {
    while (next < DEFAULT_FEEDS.length) {
      const index = next++;
      outcomes[index] = await syncOneFeed(admin, DEFAULT_FEEDS[index]!);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(FEED_CONCURRENCY, DEFAULT_FEEDS.length) }, worker),
  );

  const perFeed = outcomes.map((o) => o.count);

  return {
    feedsAttempted: DEFAULT_FEEDS.length,
    articleUpserts: perFeed.reduce((sum, f) => sum + f.articleUpserts, 0),
    liveblogSkipped: perFeed.reduce((sum, f) => sum + f.liveblogSkipped, 0),
    errors: outcomes.flatMap((o) => o.errors),
    perFeed,
  };
}
