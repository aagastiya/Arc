import OpenAI from "openai";
import { NextResponse } from "next/server";

import { verifyAndPersistStory } from "@/lib/arc/verify-story";
import { resolveSourceText } from "@/lib/rss/extract-full-text";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type StoryRow = {
  id: string;
  article_id: string;
  arc_headline: string;
  arc_summary: string;
  arc_key_points: unknown;
  arc_report: unknown;
};

type ArticleRow = {
  id: string;
  title: string;
  summary: string | null;
  link: string | null;
  full_text: string | null;
  full_text_fetched_at: string | null;
  full_text_failed_at: string | null;
  feeds: { source_name: string | null } | { source_name: string | null }[] | null;
};

function parseKeyPoints(
  value: unknown,
): Array<{ text: string; source: string }> {
  if (!Array.isArray(value)) return [];
  const points: Array<{ text: string; source: string }> = [];
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

function parseReport(
  value: unknown,
): { lead: string; sections: Array<{ title: string; body: string }> } | null {
  if (!value || typeof value !== "object") return null;
  const report = value as Record<string, unknown>;
  if (typeof report.lead !== "string" || !Array.isArray(report.sections)) {
    return null;
  }
  const sections: Array<{ title: string; body: string }> = [];
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

function sourceName(
  feeds: ArticleRow["feeds"],
): string {
  if (!feeds) return "unknown outlet";
  const feed = Array.isArray(feeds) ? feeds[0] : feeds;
  return feed?.source_name?.trim() || "unknown outlet";
}

/**
 * Run the verification pass on an existing draft without regenerating the story.
 * Used by Genre Review's "Verify now" so unverified cards can become publishable.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storyId } = await params;
    if (!storyId?.trim()) {
      return NextResponse.json({ error: "Story id is required" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfigured", details: "Missing OPENAI_API_KEY" },
        { status: 500 },
      );
    }

    const supabase = createAdminClient();

    const { data: story, error: storyErr } = await supabase
      .from("stories")
      .select(
        "id,article_id,arc_headline,arc_summary,arc_key_points,arc_report",
      )
      .eq("id", storyId)
      .maybeSingle();

    if (storyErr) {
      return NextResponse.json(
        { error: "Failed to load story", details: storyErr.message },
        { status: 500 },
      );
    }
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const row = story as StoryRow;

    const { data: links, error: linkErr } = await supabase
      .from("story_articles")
      .select("article_id")
      .eq("story_id", storyId);

    if (linkErr) {
      return NextResponse.json(
        { error: "Failed to load story sources", details: linkErr.message },
        { status: 500 },
      );
    }

    const articleIds = [
      ...new Set([
        row.article_id,
        ...((links ?? []).map((l) => l.article_id as string)),
      ]),
    ].slice(0, 5);

    const { data: articles, error: artErr } = await supabase
      .from("articles")
      .select(
        "id,title,summary,link,full_text,full_text_fetched_at,full_text_failed_at,feeds(source_name)",
      )
      .in("id", articleIds);

    if (artErr) {
      return NextResponse.json(
        { error: "Failed to load articles", details: artErr.message },
        { status: 500 },
      );
    }

    const articleRows = (articles ?? []) as unknown as ArticleRow[];
    if (articleRows.length === 0) {
      return NextResponse.json(
        { error: "No source articles found for this story" },
        { status: 400 },
      );
    }

    const resolved = await Promise.allSettled(
      articleRows.map((article) =>
        resolveSourceText({
          supabase,
          articleId: article.id,
          link: article.link,
          summary: article.summary,
          fullText: article.full_text,
          fullTextFetchedAt: article.full_text_fetched_at,
          fullTextFailedAt: article.full_text_failed_at,
        }),
      ),
    );

    const sources = articleRows.map((article, index) => {
      const outcome = resolved[index];
      const text =
        outcome?.status === "fulfilled"
          ? outcome.value.text
          : (article.summary ?? "");
      return {
        outlet: sourceName(article.feeds),
        title: article.title,
        text,
      };
    });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const verification = await verifyAndPersistStory({
      openai,
      supabase,
      storyId: row.id,
      headline: row.arc_headline,
      summary: row.arc_summary,
      keyPoints: parseKeyPoints(row.arc_key_points),
      report: parseReport(row.arc_report),
      sources,
    });

    return NextResponse.json({ ok: true, verification });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Verification failed", details: message },
      { status: 500 },
    );
  }
}
