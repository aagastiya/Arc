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

export type SyncResult = {
  feedsAttempted: number;
  articleUpserts: number;
  errors: string[];
};

export async function syncAllRssFeeds(): Promise<SyncResult> {
  const admin = createAdminClient();
  const errors: string[] = [];
  let articleUpserts = 0;

  for (const def of DEFAULT_FEEDS) {
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
        continue;
      }

      const parsed = await parser.parseURL(def.url);

      for (const item of parsed.items) {
        if (!item.link?.trim() || !item.title?.trim()) {
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
            link: item.link.trim(),
            title: item.title.trim(),
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
          errors.push(`${item.link}: ${artErr.message}`);
        } else {
          articleUpserts += 1;
        }
      }
    } catch (e) {
      errors.push(
        `${def.url}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    feedsAttempted: DEFAULT_FEEDS.length,
    articleUpserts,
    errors,
  };
}
