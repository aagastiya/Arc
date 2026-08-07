import { AdminNav } from "@/components/admin-nav";
import {
  AdminSourcesTable,
  type SourceFeedRow,
} from "@/components/admin-sources-table";
import { DEFAULT_FEEDS } from "@/config/feeds";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function AdminSourcesPage() {
  const supabase = createAdminClient();
  const activeUrls = new Set(DEFAULT_FEEDS.map((f) => f.url));
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();

  const { data: feeds, error: feedErr } = await supabase
    .from("feeds")
    .select("id,source_name,url,category")
    .order("source_name");

  if (feedErr) {
    throw new Error(`Failed to load feeds: ${feedErr.message}`);
  }

  const feedRows = feeds ?? [];
  const stats = new Map<
    string,
    { total: number; last7: number; newest: string | null }
  >();

  for (const feed of feedRows) {
    const feedId = feed.id as string;
    const [{ count: total, error: totalErr }, { count: last7, error: weekErr }, { data: newestRows, error: newestErr }] =
      await Promise.all([
        supabase
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("feed_id", feedId),
        supabase
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("feed_id", feedId)
          .gte("published_at", weekAgo),
        supabase
          .from("articles")
          .select("published_at")
          .eq("feed_id", feedId)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(1),
      ]);

    if (totalErr) throw new Error(totalErr.message);
    if (weekErr) throw new Error(weekErr.message);
    if (newestErr) throw new Error(newestErr.message);

    stats.set(feedId, {
      total: total ?? 0,
      last7: last7 ?? 0,
      newest: (newestRows?.[0]?.published_at as string | null) ?? null,
    });
  }

  const rows: SourceFeedRow[] = feedRows
    .map((feed) => {
      const s = stats.get(feed.id as string) ?? {
        total: 0,
        last7: 0,
        newest: null,
      };
      return {
        id: feed.id as string,
        source_name: feed.source_name as string,
        url: feed.url as string,
        category: (feed.category as string) ?? "today",
        active: activeUrls.has(feed.url as string),
        articles_last_7_days: s.last7,
        newest_article_at: s.newest,
        total_articles: s.total,
      };
    })
    .sort((a, b) => {
      // Dead feeds first so they are visible at a glance, then name.
      if (a.active !== b.active) return a.active ? 1 : -1;
      return a.source_name.localeCompare(b.source_name);
    });

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#c8ff00]">
              Sources
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Active feeds match{" "}
              <code className="text-zinc-500">DEFAULT_FEEDS</code>. Dead feeds
              are still in the database but no longer synced.
            </p>
          </div>
          <AdminNav current="/admin/sources" />
        </div>

        <div className="mt-8">
          <AdminSourcesTable feeds={rows} />
        </div>
      </div>
    </main>
  );
}
