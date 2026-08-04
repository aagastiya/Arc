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

export async function syncAllRssFeeds(): Promise<SyncResult> {
  const admin = createAdminClient();
  const errors: string[] = [];
  const perFeed: SyncFeedCount[] = [];
  let articleUpserts = 0;
  let liveblogSkipped = 0;

  for (const def of DEFAULT_FEEDS) {
    let feedUpserts = 0;
    let feedLiveblogSkipped = 0;
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
        perFeed.push({
          sourceName: def.sourceName,
          url: def.url,
          articleUpserts: 0,
          liveblogSkipped: 0,
        });
        continue;
      }

      const parsed = await parser.parseURL(def.url);

      for (const item of parsed.items) {
        if (!item.link?.trim() || !item.title?.trim()) {
          continue;
        }

        const link = item.link.trim();
        const title = item.title.trim();

        if (isLiveblogItem(link, title)) {
          feedLiveblogSkipped += 1;
          liveblogSkipped += 1;
          continue;
        }

        const guid = String(item.guid || item.link);
        const summary =
          item.contentSnippet?.trim() ||
          (item.content ? stripHtml(item.content) : null);
        const imageUrl = extractImageUrl(item);
        const publishedAt = item.pubDate
          ? new Date(item.pubDate).toISOString()
          : null;

        const { error: artErr } = await admin.from("articles").upsert(
          {
            feed_id: feedRow.id,
            item_guid: guid,
            link,
            title,
            summary,
            image_url: imageUrl,
            author:
              typeof item.creator === "string"
                ? item.creator
                : typeof item.author === "string"
                  ? item.author
                  : null,
            category: def.category,
            published_at: publishedAt,
          },
          { onConflict: "link" },
        );

        if (artErr) {
          errors.push(`${link}: ${artErr.message}`);
        } else {
          feedUpserts += 1;
          articleUpserts += 1;
        }
      }
    } catch (e) {
      errors.push(
        `${def.url}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    perFeed.push({
      sourceName: def.sourceName,
      url: def.url,
      articleUpserts: feedUpserts,
      liveblogSkipped: feedLiveblogSkipped,
    });
  }

  return {
    feedsAttempted: DEFAULT_FEEDS.length,
    articleUpserts,
    liveblogSkipped,
    errors,
    perFeed,
  };
}
