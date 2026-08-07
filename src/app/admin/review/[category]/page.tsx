import { notFound } from "next/navigation";

import { parseVerification } from "@/app/admin/[id]/verification-panel";
import { AdminNav } from "@/components/admin-nav";
import {
  AdminGenreReview,
  type ReviewEntity,
  type ReviewEvent,
  type ReviewKeyPoint,
  type ReviewReport,
  type ReviewSource,
  type ReviewStory,
} from "@/components/admin-genre-review";
import {
  canonicalCategoryToDbValue,
  normalizeStoryCategory,
  parseReviewCategorySlug,
  reviewCategorySlug,
} from "@/lib/categories";
import { clampImportance, IMPORTANCE_DEFAULT } from "@/lib/edition";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const STORY_SELECT =
  "id,article_id,arc_headline,arc_summary,arc_key_points,arc_report,importance,category,verification,is_live,created_at";

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
  created_at: string;
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

export default async function AdminGenreReviewPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: raw } = await params;
  const bucket = parseReviewCategorySlug(raw);
  if (!bucket) notFound();

  const slug = reviewCategorySlug(bucket);
  const dbValue = canonicalCategoryToDbValue(bucket);
  const supabase = createAdminClient();

  // Pull a wide draft set, then keep those whose normalized bucket matches —
  // older rows may still carry aliases like "politics".
  const { data: draftData, error: draftErr } = await supabase
    .from("stories")
    .select(STORY_SELECT)
    .eq("is_live", false)
    .order("importance", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (draftErr) {
    throw new Error(`Failed to load drafts: ${draftErr.message}`);
  }

  const drafts = ((draftData ?? []) as StoryRow[]).filter(
    (row) => normalizeStoryCategory(row.category) === bucket,
  );

  const { count: liveCount, error: liveErr } = await supabase
    .from("stories")
    .select("id", { count: "exact", head: true })
    .eq("is_live", true)
    .eq("category", dbValue);

  if (liveErr) {
    throw new Error(`Failed to count live stories: ${liveErr.message}`);
  }

  const storyIds = drafts.map((d) => d.id);
  const articleIdSet = new Set(drafts.map((d) => d.article_id));

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
        .select("story_id,article_id,articles(id,title,link,feeds(source_name))")
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
      articleIdSet.add(articleId);

      const article = Array.isArray(row.articles)
        ? row.articles[0]
        : row.articles;
      if (!article || typeof article !== "object") continue;
      const a = article as {
        id: string;
        title: string;
        link: string | null;
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

  // Primary article may not be in story_articles for older rows — fill from articles.
  const missingPrimary = drafts
    .filter((d) => !(sourcesByStory.get(d.id) ?? []).some((s) => s.id === d.article_id))
    .map((d) => d.article_id);

  if (missingPrimary.length > 0) {
    for (const ids of chunk([...new Set(missingPrimary)], 40)) {
      const { data: articles, error } = await supabase
        .from("articles")
        .select("id,title,link,feeds(source_name)")
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

  const reviewStories: ReviewStory[] = drafts.map((row) => {
    const articleIds = articleIdsByStory.get(row.id) ?? [row.article_id];
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
      sources: sourcesByStory.get(row.id) ?? [],
      entities: entitiesByStory.get(row.id) ?? [],
      events: eventsByStory.get(row.id) ?? [],
    };
  });

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex justify-end">
          <AdminNav current="/admin/review" />
        </div>
        <AdminGenreReview
          categorySlug={slug}
          categoryLabel={bucket}
          liveCount={liveCount ?? 0}
          initialStories={reviewStories}
        />
      </div>
    </main>
  );
}
