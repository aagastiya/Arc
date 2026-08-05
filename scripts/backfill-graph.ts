/**
 * Backfill knowledge-graph extraction for stories with no story_entities.
 *
 * Run: npx tsx --env-file=.env.local scripts/backfill-graph.ts
 */
import OpenAI from "openai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  extractAndPersistGraph,
  type GraphResult,
} from "../src/lib/arc/extract-graph";
import { resolveSourceText } from "../src/lib/rss/extract-full-text";

const DELAY_MS = 800;

type KeyPoint = { text: string; source: string };
type ArcReport = {
  lead: string;
  sections: Array<{ title: string; body: string }>;
};

type StoryRow = {
  id: string;
  article_id: string;
  arc_headline: string;
  arc_summary: string;
  arc_storyline: unknown;
  arc_key_points: unknown;
  arc_report: unknown;
};

type ArticleRow = {
  id: string;
  link: string | null;
  summary: string | null;
  full_text: string | null;
  full_text_fetched_at: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseKeyPoints(value: unknown): KeyPoint[] {
  if (!Array.isArray(value)) return [];
  const points: KeyPoint[] = [];
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

function parseReport(value: unknown): ArcReport | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.lead !== "string") return null;
  const sectionsRaw = Array.isArray(obj.sections) ? obj.sections : [];
  const sections: ArcReport["sections"] = [];
  for (const item of sectionsRaw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.title !== "string" || typeof s.body !== "string") continue;
    sections.push({ title: s.title, body: s.body });
  }
  return { lead: obj.lead, sections };
}

async function findStoriesMissingGraph(
  supabase: SupabaseClient,
): Promise<StoryRow[]> {
  const { data: stories, error: storiesErr } = await supabase
    .from("stories")
    .select(
      "id,article_id,arc_headline,arc_summary,arc_storyline,arc_key_points,arc_report",
    )
    .order("created_at", { ascending: true });

  if (storiesErr) {
    throw new Error(`Failed to load stories: ${storiesErr.message}`);
  }

  const all = (stories ?? []) as StoryRow[];
  if (all.length === 0) return [];

  const { data: links, error: linkErr } = await supabase
    .from("story_entities")
    .select("story_id");

  if (linkErr) {
    throw new Error(`Failed to load story_entities: ${linkErr.message}`);
  }

  const withGraph = new Set((links ?? []).map((r) => r.story_id as string));
  return all.filter((s) => !withGraph.has(s.id));
}

async function loadLinkedArticles(
  supabase: SupabaseClient,
  story: StoryRow,
): Promise<ArticleRow[]> {
  const ids = new Set<string>();
  if (story.article_id) ids.add(story.article_id);

  const { data: sa, error: saErr } = await supabase
    .from("story_articles")
    .select("article_id")
    .eq("story_id", story.id);

  if (saErr) {
    throw new Error(`Failed to load story_articles: ${saErr.message}`);
  }
  for (const row of sa ?? []) {
    if (row.article_id) ids.add(row.article_id as string);
  }

  const articleIds = [...ids];
  if (articleIds.length === 0) return [];

  const { data: articles, error: artErr } = await supabase
    .from("articles")
    .select("id,link,summary,full_text,full_text_fetched_at")
    .in("id", articleIds);

  if (artErr) {
    throw new Error(`Failed to load articles: ${artErr.message}`);
  }

  return (articles ?? []) as ArticleRow[];
}

async function existingEntityIds(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const { data, error } = await supabase.from("entities").select("id");
  if (error) {
    throw new Error(`Failed to load entities: ${error.message}`);
  }
  return new Set((data ?? []).map((r) => r.id as string));
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!openaiKey) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const openai = new OpenAI({ apiKey: openaiKey });

  const missing = await findStoriesMissingGraph(supabase);
  console.log(`Stories missing graph entities: ${missing.length}`);

  const stats = {
    processed: 0,
    failures: 0,
    entitiesCreated: 0,
    entitiesReused: 0,
    eventPropose: 0,
    eventMatch: 0,
    eventNone: 0,
  };
  const failureLog: Array<{ id: string; title: string; error: string }> = [];

  for (let i = 0; i < missing.length; i++) {
    const story = missing[i]!;
    const title = story.arc_headline || "(no headline)";
    const prefix = `[${i + 1}/${missing.length}]`;

    try {
      const articles = await loadLinkedArticles(supabase, story);
      for (const article of articles) {
        await resolveSourceText({
          supabase,
          articleId: article.id,
          link: article.link,
          summary: article.summary,
          fullText: article.full_text,
          fullTextFetchedAt: article.full_text_fetched_at,
        });
      }

      const beforeIds = await existingEntityIds(supabase);

      const result: GraphResult = await extractAndPersistGraph({
        openai,
        supabase,
        storyId: story.id,
        headline: story.arc_headline ?? "",
        summary: story.arc_summary ?? "",
        keyPoints: parseKeyPoints(story.arc_key_points),
        report: parseReport(story.arc_report),
        storyline: story.arc_storyline,
      });

      let created = 0;
      let reused = 0;
      for (const ent of result.entities) {
        if (beforeIds.has(ent.id)) reused += 1;
        else created += 1;
      }

      stats.processed += 1;
      stats.entitiesCreated += created;
      stats.entitiesReused += reused;
      if (result.event.action === "propose") stats.eventPropose += 1;
      else if (result.event.action === "match") stats.eventMatch += 1;
      else stats.eventNone += 1;

      const names = result.entities.map((e) => e.name).join(", ") || "(none)";
      console.log(
        `${prefix} OK  ${title.slice(0, 80)}\n` +
          `         entities=${result.entities.length} (created=${created}, reused=${reused}) [${names}]\n` +
          `         event=${result.event.action}` +
          (result.event.title ? ` "${result.event.title}"` : ""),
      );
    } catch (err: unknown) {
      stats.failures += 1;
      const message = err instanceof Error ? err.message : String(err);
      failureLog.push({ id: story.id, title, error: message });
      console.error(`${prefix} FAIL ${title.slice(0, 80)}\n         ${message}`);
    }

    if (i < missing.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`Stories processed:     ${stats.processed}`);
  console.log(`Failures:              ${stats.failures}`);
  console.log(`Entities created:      ${stats.entitiesCreated}`);
  console.log(`Entities reused:       ${stats.entitiesReused}`);
  console.log(`Events proposed:       ${stats.eventPropose}`);
  console.log(`Events matched:        ${stats.eventMatch}`);
  console.log(`Events none:           ${stats.eventNone}`);
  if (failureLog.length > 0) {
    console.log("\nFailures:");
    for (const f of failureLog) {
      console.log(`  - ${f.id} | ${f.title.slice(0, 60)} | ${f.error}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
