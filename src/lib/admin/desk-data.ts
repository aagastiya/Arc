import type {
  ReviewEntity,
  ReviewEvent,
  ReviewKeyPoint,
  ReviewReport,
  ReviewSource,
  ReviewStory,
} from "@/components/admin-genre-review";
import { parseVerification } from "@/lib/arc/verification";
import {
  CANONICAL_CATEGORY_ORDER,
  dbCategoryValuesForBucket,
  normalizeStoryCategory,
  reviewCategorySlug,
  type StoryCategoryBucket,
} from "@/lib/categories";
import { clampImportance, editionDayStart, IMPORTANCE_DEFAULT } from "@/lib/edition";
import { newestSourcePublishedAt } from "@/lib/story-dates";
import { createAdminClient } from "@/lib/supabase/admin";

export const DESK_TARGET_PER_GENRE = 8;

export type DeskClusterArticle = {
  id: string;
  title: string;
  source_name: string;
  published_at: string | null;
};

export type DeskCluster = {
  topic: string;
  why_it_matters: string;
  importance: number;
  category: string;
  article_ids: string[];
  source_count: number;
  suggested_event: string;
  articles: DeskClusterArticle[];
  matched_event: { id: string; title: string } | null;
  proposed_event_title: string | null;
  existing_story: {
    id: string;
    headline: string;
    importance: number | null;
    flags: number | null;
  } | null;
};

export type DeskLiveStory = {
  id: string;
  headline: string;
  importance: number;
  published_at: string | null;
};

export type DeskGenre = {
  bucket: StoryCategoryBucket;
  slug: string;
  liveCount: number;
  drafts: ReviewStory[];
  liveStories: DeskLiveStory[];
};

export type DeskScanCache = {
  clusters: DeskCluster[];
  cachedAt: string | null;
  windowHours: number;
  articlesScanned: number;
};

const STORY_SELECT =
  "id,article_id,arc_headline,arc_summary,arc_key_points,arc_report,importance,category,verification,is_live,published_at,created_at,archived_at";

type StoryRow = {
  id: string;
  article_id: string;
  arc_headline: string;
  arc_summary: string;
  arc_key_points: unknown;
  arc_report: unknown;
  importance: number | null;
  category: string;
  verification: unknown;
  is_live: boolean;
  published_at: string | null;
  created_at: string;
  archived_at: string | null;
};

function parseKeyPoints(value: unknown): ReviewKeyPoint[] {
  if (!Array.isArray(value)) return [];
  const points: ReviewKeyPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.text !== "string" || typeof entry.source !== "string") {
      continue;
    }
    points.push({ text: entry.text, source: entry.source });
  }
  return points;
}

function parseReport(value: unknown): ReviewReport | null {
  if (!value || typeof value !== "object") return null;
  const report = value as Record<string, unknown>;
  if (typeof report.lead !== "string" || !Array.isArray(report.sections)) {
    return null;
  }
  const sections: ReviewReport["sections"] = [];
  for (const item of report.sections) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.title !== "string" || typeof entry.body !== "string") {
      continue;
    }
    sections.push({ title: entry.title, body: entry.body });
  }
  return { lead: report.lead, sections };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function enrichStories(
  supabase: ReturnType<typeof createAdminClient>,
  drafts: StoryRow[],
): Promise<ReviewStory[]> {
  const storyIds = drafts.map((d) => d.id);
  const sourcesByStory = new Map<string, ReviewSource[]>();
  const articleIdsByStory = new Map<string, string[]>();
  const entitiesByStory = new Map<string, ReviewEntity[]>();
  const eventsByStory = new Map<string, ReviewEvent[]>();

  for (const ids of chunk(storyIds, 40)) {
    if (ids.length === 0) continue;

    const [
      { data: links, error: linkErr },
      { data: entityLinks, error: entErr },
      { data: eventLinks, error: evErr },
    ] = await Promise.all([
      supabase
        .from("story_articles")
        .select(
          "story_id,article_id,articles(id,title,link,published_at,feeds(source_name))",
        )
        .in("story_id", ids),
      supabase
        .from("story_entities")
        .select(
          "story_id,entity_id,role,entities(id,kind,name,short_description)",
        )
        .in("story_id", ids),
      supabase
        .from("story_events")
        .select("story_id,event_id,events(id,title,open_question)")
        .in("story_id", ids),
    ]);

    if (linkErr) throw new Error(`Failed to load sources: ${linkErr.message}`);
    if (entErr) throw new Error(`Failed to load entities: ${entErr.message}`);
    if (evErr) throw new Error(`Failed to load events: ${evErr.message}`);

    for (const row of links ?? []) {
      const storyId = row.story_id as string;
      const articleId = row.article_id as string;
      articleIdsByStory.set(storyId, [
        ...(articleIdsByStory.get(storyId) ?? []),
        articleId,
      ]);

      const article = Array.isArray(row.articles)
        ? row.articles[0]
        : row.articles;
      if (!article || typeof article !== "object") continue;
      const a = article as {
        id: string;
        title: string;
        link: string | null;
        published_at: string | null;
        feeds:
          | { source_name: string | null }
          | { source_name: string | null }[]
          | null;
      };
      const feed = Array.isArray(a.feeds) ? a.feeds[0] : a.feeds;
      const list = sourcesByStory.get(storyId) ?? [];
      list.push({
        id: a.id,
        title: a.title,
        link: a.link,
        source_name: feed?.source_name ?? null,
        published_at: a.published_at ?? null,
      });
      sourcesByStory.set(storyId, list);
    }

    for (const row of entityLinks ?? []) {
      const storyId = row.story_id as string;
      const ent = Array.isArray(row.entities) ? row.entities[0] : row.entities;
      if (!ent || typeof ent !== "object") continue;
      const e = ent as {
        id: string;
        kind: string;
        name: string;
        short_description: string;
      };
      const list = entitiesByStory.get(storyId) ?? [];
      list.push({
        entity_id: row.entity_id as string,
        name: e.name,
        kind: e.kind,
        role: (row.role as string) || "mentioned",
        short_description: e.short_description ?? "",
      });
      entitiesByStory.set(storyId, list);
    }

    for (const row of eventLinks ?? []) {
      const storyId = row.story_id as string;
      const ev = Array.isArray(row.events) ? row.events[0] : row.events;
      if (!ev || typeof ev !== "object") continue;
      const e = ev as { id: string; title: string; open_question: string };
      const list = eventsByStory.get(storyId) ?? [];
      list.push({
        event_id: row.event_id as string,
        title: e.title,
        open_question: e.open_question ?? "",
      });
      eventsByStory.set(storyId, list);
    }
  }

  const missingPrimary = drafts
    .filter(
      (d) =>
        !(sourcesByStory.get(d.id) ?? []).some((s) => s.id === d.article_id),
    )
    .map((d) => d.article_id);

  if (missingPrimary.length > 0) {
    for (const ids of chunk([...new Set(missingPrimary)], 40)) {
      const { data: articles, error } = await supabase
        .from("articles")
        .select("id,title,link,published_at,feeds(source_name)")
        .in("id", ids);
      if (error) throw new Error(`Failed to load articles: ${error.message}`);
      const byId = new Map(
        (articles ?? []).map((a) => {
          const feed = Array.isArray(a.feeds) ? a.feeds[0] : a.feeds;
          return [
            a.id as string,
            {
              id: a.id as string,
              title: a.title as string,
              link: (a.link as string | null) ?? null,
              source_name:
                (feed as { source_name: string | null } | null)?.source_name ??
                null,
              published_at: (a.published_at as string | null) ?? null,
            } satisfies ReviewSource,
          ];
        }),
      );
      for (const draft of drafts) {
        const source = byId.get(draft.article_id);
        if (!source) continue;
        const list = sourcesByStory.get(draft.id) ?? [];
        if (!list.some((s) => s.id === source.id)) {
          sourcesByStory.set(draft.id, [source, ...list]);
        }
        const aids = articleIdsByStory.get(draft.id) ?? [];
        if (!aids.includes(draft.article_id)) {
          articleIdsByStory.set(draft.id, [draft.article_id, ...aids]);
        }
      }
    }
  }

  return drafts.map((row) => {
    const articleIds = articleIdsByStory.get(row.id) ?? [row.article_id];
    const sources = sourcesByStory.get(row.id) ?? [];
    return {
      id: row.id,
      article_id: row.article_id,
      article_ids: [...new Set(articleIds)],
      headline: row.arc_headline,
      standfirst: row.arc_summary,
      importance: clampImportance(row.importance ?? IMPORTANCE_DEFAULT),
      key_points: parseKeyPoints(row.arc_key_points),
      report: parseReport(row.arc_report),
      verification: parseVerification(row.verification),
      sources,
      entities: entitiesByStory.get(row.id) ?? [],
      events: eventsByStory.get(row.id) ?? [],
      published_at: row.published_at,
      newest_source_at: newestSourcePublishedAt(
        sources.map((s) => s.published_at),
      ),
    };
  });
}

export async function loadDeskScanCache(): Promise<DeskScanCache> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_cache")
    .select("category,payload,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[desk] scan_cache load failed:", error.message);
    return {
      clusters: [],
      cachedAt: null,
      windowHours: 24,
      articlesScanned: 0,
    };
  }

  const clusters: DeskCluster[] = [];
  let cachedAt: string | null = null;
  let windowHours = 24;
  let articlesScanned = 0;

  for (const row of data ?? []) {
    const payload = row.payload as {
      clusters?: DeskCluster[];
      window_hours?: number;
      articles_scanned?: number;
    } | null;
    if (!payload) continue;
    if (Array.isArray(payload.clusters)) {
      for (const c of payload.clusters) {
        clusters.push({
          ...c,
          source_count: c.source_count ?? c.article_ids?.length ?? 0,
          existing_story: c.existing_story ?? null,
        });
      }
    }
    if (typeof payload.window_hours === "number") windowHours = payload.window_hours;
    if (typeof payload.articles_scanned === "number") {
      articlesScanned += payload.articles_scanned;
    }
    const created = row.created_at as string;
    if (!cachedAt || created > cachedAt) cachedAt = created;
  }

  // Re-attach existing drafts so already-generated picks hide as clusters.
  const articleIds = [...new Set(clusters.flatMap((c) => c.article_ids))];
  if (articleIds.length > 0) {
    const { data: links } = await supabase
      .from("story_articles")
      .select("article_id,story_id,stories(id,arc_headline,importance,verification,is_live,archived_at)")
      .in("article_id", articleIds);

    const byArticle = new Map<
      string,
      DeskCluster["existing_story"]
    >();
    for (const row of links ?? []) {
      const story = Array.isArray(row.stories) ? row.stories[0] : row.stories;
      if (!story || typeof story !== "object") continue;
      const s = story as {
        id: string;
        arc_headline: string;
        importance: number | null;
        verification: { flags?: unknown[] } | null;
        is_live: boolean;
        archived_at: string | null;
      };
      if (s.is_live || s.archived_at) continue;
      const flags = Array.isArray(s.verification?.flags)
        ? s.verification.flags.length
        : null;
      byArticle.set(row.article_id as string, {
        id: s.id,
        headline: s.arc_headline,
        importance: s.importance,
        flags,
      });
    }
    for (const cluster of clusters) {
      cluster.existing_story =
        cluster.article_ids.map((id) => byArticle.get(id)).find(Boolean) ??
        cluster.existing_story;
    }
  }

  clusters.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return (b.source_count ?? 0) - (a.source_count ?? 0);
  });

  return { clusters, cachedAt, windowHours, articlesScanned };
}

export async function loadDeskGenres(): Promise<{
  genres: DeskGenre[];
  totalLiveToday: number;
  editionLabel: string;
}> {
  const supabase = createAdminClient();
  const dayStart = editionDayStart();
  const editionLabel = dayStart.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const { data: draftData, error: draftErr } = await supabase
    .from("stories")
    .select(STORY_SELECT)
    .eq("is_live", false)
    .is("archived_at", null)
    .order("importance", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(400);

  if (draftErr) {
    throw new Error(`Failed to load drafts: ${draftErr.message}`);
  }

  const allDrafts = (draftData ?? []) as StoryRow[];
  const enriched = await enrichStories(supabase, allDrafts);

  const { data: liveData, error: liveErr } = await supabase
    .from("stories")
    .select("id,arc_headline,importance,category,published_at,carried_over_at")
    .eq("is_live", true)
    .or(
      `published_at.gte.${dayStart.toISOString()},carried_over_at.gte.${dayStart.toISOString()}`,
    )
    .order("importance", { ascending: false, nullsFirst: false })
    .limit(200);

  if (liveErr) {
    throw new Error(`Failed to load live stories: ${liveErr.message}`);
  }

  const liveRows = liveData ?? [];
  const totalLiveToday = liveRows.length;

  const genres: DeskGenre[] = CANONICAL_CATEGORY_ORDER.map((bucket) => {
    const slug = reviewCategorySlug(bucket);
    const drafts = enriched
      .filter((s) => {
        const row = allDrafts.find((d) => d.id === s.id);
        return row
          ? normalizeStoryCategory(row.category) === bucket
          : false;
      })
      .sort((a, b) => {
        if (b.importance !== a.importance) return b.importance - a.importance;
        return (b.newest_source_at ?? "").localeCompare(a.newest_source_at ?? "");
      });

    const liveStories: DeskLiveStory[] = liveRows
      .filter((row) => normalizeStoryCategory(row.category as string) === bucket)
      .map((row) => ({
        id: row.id as string,
        headline: row.arc_headline as string,
        importance: clampImportance(
          (row.importance as number | null) ?? IMPORTANCE_DEFAULT,
        ),
        published_at: (row.published_at as string | null) ?? null,
      }));

    // Prefer exact live count for the genre (edition day), not only from the limited select.
    return {
      bucket,
      slug,
      liveCount: liveStories.length,
      drafts,
      liveStories,
    };
  });

  // Refine live counts with head queries for accuracy.
  await Promise.all(
    genres.map(async (genre) => {
      const values = dbCategoryValuesForBucket(genre.bucket);
      if (values.length === 0) return;
      const { count } = await supabase
        .from("stories")
        .select("id", { count: "exact", head: true })
        .eq("is_live", true)
        .in("category", values)
        .or(
          `published_at.gte.${dayStart.toISOString()},carried_over_at.gte.${dayStart.toISOString()}`,
        );
      if (typeof count === "number") genre.liveCount = count;
    }),
  );

  return {
    genres,
    totalLiveToday: genres.reduce((sum, g) => sum + g.liveCount, 0) || totalLiveToday,
    editionLabel: `${editionLabel} · UTC`,
  };
}
