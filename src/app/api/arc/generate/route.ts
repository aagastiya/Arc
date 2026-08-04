// Arc per-article generator endpoint
// POST /api/arc/generate?id=<article_uuid>[,uuid2,...]
// Fetches one or more articles, generates Arc-voice content via OpenAI,
// and saves it as a draft (is_live=false) in the stories table.

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

import { extractAndPersistGraph } from "@/lib/arc/extract-graph";
import { isAllowedStoryCategoryDbValue } from "@/lib/categories";
import {
  resolveSourceText,
  type ResolvedSourceText,
  type SourceQuality,
} from "@/lib/rss/extract-full-text";

const ARC_VOICE_PROMPT = `You are Arc, a calm and clear news writer for a global English-speaking audience.

Your voice rules:
- Calm, never breathless. No "BREAKING", no all caps, no urgency words.
- Plain English. Short sentences. The reading level of a smart 18-year-old.
- Fact-first. What happened, then context, then what's next.
- Neutral. No opinion words like "shocking", "outrageous", "stunning".
- Do not give the reader advice. Do not tell them to stay safe, stay hydrated, stay informed, etc.
- Warmer than Reuters, more disciplined than BuzzFeed. Like a sharp friend explaining news over coffee.
- State only what happened or what was said. Never predict, assess, or characterize significance with phrases like "will be crucial", "is expected to", "could be pivotal", "adds weight to", "underscores the implications". If a claim is about the future or about importance, it may only appear as an attributed statement someone actually made.
- Do not characterize facts with framing verbs: "highlights", "underscores", "emphasizes", "reflects", "signals", "shows his/her/their commitment". State the fact; let it speak.

Density and honesty:
- Extract and use EVERY concrete specific present in the input article: numbers, amounts, full names, titles, dates, places. Missing a number that was in the input is a failure.
- Prefer exact numbers, full names, and real dates everywhere you are confident.
- Comparisons that create context are encouraged (e.g. "six times last year's figure") only when you are factually confident. Never invent numbers, dates, names, or events.
- Fewer confident facts beat more invented ones.
- If the input article is thin on facts, write LESS. A short factual report beats a padded one. Sections may be 1-2 sentences. It is acceptable to output only 2 sections, or even 1 section plus the backward-looking final section, when facts are scarce. Never fill space with commentary, predictions, or generalities.

Sourcing:
- Each key point has a "source" field.
- "source" must be EXACTLY one of: an outlet name that appears in a Source label in the user message, or the empty string "".
- Never write "unknown", "N/A", "various", "background", or any other placeholder. If the fact does not come from a provided article, source is "".
- The labels "unknown" and "unknown outlet" are not outlet names. If an article's Source label says unknown, facts from it get source "".
- Never invent an attribution. Never name an outlet that was not provided as a Source label.

Multiple sources:
- You may receive one or several articles about the same event, each labeled with its Source outlet.
- A fact reported by multiple articles is core — build the story around repeated facts.
- Details unique to one article may be used; attribute them to that article's outlet.
- The "source" field of each key point must be the outlet name of the article that reported that fact (exactly as given in the Source label), or "" for background knowledge. If several outlets reported it, pick the most authoritative single one.
- If articles CONFLICT on a fact (different numbers, different claims), state the conflict plainly in the report body (e.g. "Reuters reports X; The Hindu reports Y"). Never silently choose one version.
- Never attribute a fact to an outlet whose article did not contain it.

Given a news article, return ONLY valid JSON in this exact shape, with no extra prose, no markdown, no code fences:

{
  "arc_headline": "8 to 14 words; must include the single most concrete detail (a number, name, or specific thing) — never vague",
  "arc_summary": "ONE sentence standfirst that states today's fact AND why it matters in the bigger picture (e.g. largest since X, first time Y). Not a generic summary.",
  "arc_key_points": [
    { "text": "self-contained factual sentence, dense with specifics: names, numbers, dates", "source": "outlet name or empty string" }
  ],
  "arc_report": {
    "lead": "1-2 paragraphs stating the core news with full specifics",
    "sections": [
      { "title": "specific editorial title (e.g. A Deal That Keeps Growing) — never generic like Background or Details", "body": "1-3 paragraphs" }
    ]
  },
  "arc_storyline": [
    { "date": "YYYY or YYYY-MM or YYYY-MM-DD or a year range like 2015-2019", "event": "one short sentence describing what happened on that date" }
  ],
  "category": "world | india | finance | tech | sports | local"
}

Field rules:
- arc_key_points: exactly 3 items.
  - Point 1 = the core news.
  - Point 2 = the key development or detail.
  - Point 3 = the wider frame or concrete stake.
- arc_report: prefer 2-3 sections when the input has enough facts; when facts are scarce, fewer is fine (including 1 section plus the required final section).
  - Section titles must be specific and editorial, never generic labels like "Background", "Details", "Context", or "Analysis".
  - THE LAST SECTION must always be backward-looking context — how this story got here, told chronologically.
- category: assign exactly one of: world, india, finance, tech, sports, local. Choose from the story content, not from the article's existing category label alone.

Storyline rules:
- Include 3 to 7 events when you have confident dated knowledge. Order oldest first; the last event is today's fact from the article.
- Each event needs a date you are confident about. Use whatever precision you know — year, month, day, or range.
- Never invent events, dates, or numbers. If you are not confident enough to build a real storyline, return "arc_storyline": []. An honest empty storyline beats a hallucinated one.
- Today's event should restate the article's core fact in one short Arc-voice sentence.`;

type KeyPoint = { text: string; source: string };
type ReportSection = { title: string; body: string };
type ArcReport = { lead: string; sections: ReportSection[] };

type ArticleRow = {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  published_at: string | null;
  link: string | null;
  full_text: string | null;
  full_text_fetched_at: string | null;
  feeds: { source_name: string | null } | { source_name: string | null }[] | null;
};

type ArticleWithSource = ArticleRow & {
  resolved: ResolvedSourceText;
};

function parseKeyPoints(value: unknown): KeyPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const points: KeyPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.text !== "string" || typeof entry.source !== "string") {
      continue;
    }
    points.push({ text: entry.text, source: entry.source });
  }

  return points;
}

function parseReport(value: unknown): ArcReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const report = value as Record<string, unknown>;
  if (typeof report.lead !== "string" || !Array.isArray(report.sections)) {
    return null;
  }

  const sections: ReportSection[] = [];
  for (const item of report.sections) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.title !== "string" || typeof entry.body !== "string") {
      continue;
    }
    sections.push({ title: entry.title, body: entry.body });
  }

  return { lead: report.lead, sections };
}

function parseCategory(value: unknown, fallback: string): string {
  if (typeof value === "string" && isAllowedStoryCategoryDbValue(value)) {
    return value;
  }
  return fallback;
}

function parseArticleIds(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function getSourceName(article: ArticleRow): string | null {
  const feeds = article.feeds;
  if (!feeds) {
    return null;
  }
  if (Array.isArray(feeds)) {
    return feeds[0]?.source_name ?? null;
  }
  return feeds.source_name;
}

function buildUserMessage(articles: ArticleWithSource[]): string {
  if (articles.length === 1) {
    const article = articles[0]!;
    const source = getSourceName(article) || "unknown";
    return `Title: ${article.title}
Source: ${source}
Published: ${article.published_at || "unknown"}
Category: ${article.category || "general"}
Source quality: ${article.resolved.quality}

Article text:
${article.resolved.text}`;
  }

  return articles
    .map((article, index) => {
      const source = getSourceName(article) || "unknown outlet";
      return `Article ${index + 1} — Source: ${source} — Published: ${article.published_at || "unknown"}
Title: ${article.title}
Source quality: ${article.resolved.quality}

Article text:
${article.resolved.text}`;
    })
    .join("\n\n---\n\n");
}

export async function POST(request: Request) {
  try {
    // 1. Parse article IDs from query string (?id=uuid or ?id=uuid1,uuid2,...)
    const { searchParams } = new URL(request.url);
    const articleIds = parseArticleIds(searchParams.get("id"));

    if (articleIds.length === 0) {
      return NextResponse.json(
        { error: "Missing article id. Use ?id=<uuid> or ?id=<uuid1,uuid2,...>" },
        { status: 400 }
      );
    }

    if (articleIds.length > 5) {
      return NextResponse.json(
        { error: "Too many article ids. Maximum is 5." },
        { status: 400 }
      );
    }

    // 2. Fetch articles from Supabase (with feed source names)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: fetched, error: fetchError } = await supabase
      .from("articles")
      .select(
        "id,title,summary,category,published_at,link,full_text,full_text_fetched_at,feeds(source_name)",
      )
      .in("id", articleIds);

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to fetch articles", details: fetchError.message },
        { status: 500 }
      );
    }

    const byId = new Map(
      ((fetched ?? []) as ArticleRow[]).map((row) => [row.id, row]),
    );
    const missing = articleIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "Article not found", missing },
        { status: 404 }
      );
    }

    const baseArticles = articleIds.map((id) => byId.get(id)!);
    const firstArticle = baseArticles[0]!;
    const firstId = articleIds[0]!;

    // 3. Resolve full text (cache → extract → thin fallback)
    const articles: ArticleWithSource[] = [];
    for (const article of baseArticles) {
      const resolved = await resolveSourceText({
        supabase,
        articleId: article.id,
        link: article.link,
        summary: article.summary,
        fullText: article.full_text,
        fullTextFetchedAt: article.full_text_fetched_at,
      });
      articles.push({ ...article, resolved });
    }

    const sourceQuality: Array<{
      article_id: string;
      quality: SourceQuality;
      text_length: number;
      from_cache: boolean;
    }> = articles.map((a) => ({
      article_id: a.id,
      quality: a.resolved.quality,
      text_length: a.resolved.textLength,
      from_cache: a.resolved.fromCache,
    }));

    // 4. Build the user message for OpenAI
    const userMessage = buildUserMessage(articles);

    // 5. Call OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ARC_VOICE_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    });

    const rawResponse = completion.choices[0]?.message?.content;

    if (!rawResponse) {
      return NextResponse.json(
        { error: "OpenAI returned empty response" },
        { status: 500 }
      );
    }

    // 6. Parse and validate the AI response
    let parsed;
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      return NextResponse.json(
        { error: "OpenAI returned invalid JSON", raw: rawResponse },
        { status: 500 }
      );
    }

    const arcHeadline = parsed.arc_headline;
    const arcSummary = parsed.arc_summary;
    const arcStoryline = Array.isArray(parsed.arc_storyline)
      ? parsed.arc_storyline
      : [];
    const arcKeyPoints = parseKeyPoints(parsed.arc_key_points);
    const arcReport = parseReport(parsed.arc_report);
    const category = parseCategory(
      parsed.category,
      firstArticle.category || "today",
    );

    if (!arcHeadline || !arcSummary) {
      return NextResponse.json(
        { error: "AI response missing required fields", parsed },
        { status: 500 }
      );
    }

    // 7. Upsert into stories table as draft (primary article = first ID)
    const { data: savedStory, error: saveError } = await supabase
      .from("stories")
      .upsert(
        {
          article_id: firstId,
          arc_headline: arcHeadline,
          arc_summary: arcSummary,
          arc_storyline: arcStoryline,
          arc_key_points: arcKeyPoints,
          arc_report: arcReport,
          category,
          is_live: false,
        },
        { onConflict: "article_id" }
      )
      .select()
      .single();

    if (saveError || !savedStory) {
      return NextResponse.json(
        { error: "Failed to save story", details: saveError?.message },
        { status: 500 }
      );
    }

    // 8. Link all provided articles in story_articles
    const { error: linkError } = await supabase.from("story_articles").upsert(
      articleIds.map((article_id) => ({
        story_id: savedStory.id as string,
        article_id,
      })),
      { onConflict: "story_id,article_id", ignoreDuplicates: true }
    );

    if (linkError) {
      return NextResponse.json(
        { error: "Failed to save story article links", details: linkError.message },
        { status: 500 }
      );
    }

    // 9. Graph extraction pass (non-fatal — story already saved)
    let graph: Awaited<ReturnType<typeof extractAndPersistGraph>> | null = null;
    try {
      graph = await extractAndPersistGraph({
        openai,
        supabase,
        storyId: savedStory.id as string,
        headline: arcHeadline,
        summary: arcSummary,
        keyPoints: arcKeyPoints,
        report: arcReport,
        storyline: arcStoryline,
      });
    } catch (graphErr: unknown) {
      const message =
        graphErr instanceof Error ? graphErr.message : "Unknown graph error";
      console.error("[arc/generate] graph extraction failed:", message);
      graph = null;
    }

    // 10. Return everything for inspection
    return NextResponse.json({
      original: {
        id: firstArticle.id,
        title: firstArticle.title,
        summary: firstArticle.summary,
        link: firstArticle.link,
        category: firstArticle.category,
        published_at: firstArticle.published_at,
      },
      article_ids: articleIds,
      source_quality: sourceQuality,
      arc: {
        arc_headline: arcHeadline,
        arc_summary: arcSummary,
        arc_storyline: arcStoryline,
        arc_key_points: arcKeyPoints,
        arc_report: arcReport,
        category,
      },
      graph,
      saved_story: savedStory,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 }
    );
  }
}
