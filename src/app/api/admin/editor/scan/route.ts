// Arc AI editor — scan, cluster, rank.
// POST /api/admin/editor/scan
// Reads recent articles from active feeds and asks OpenAI to group them into
// story clusters ranked by real-world significance. Never publishes anything.

import { NextResponse } from "next/server";
import OpenAI from "openai";

import { DEFAULT_FEEDS } from "@/config/feeds";
import { isLiveblogItem } from "@/lib/rss/sync-feeds";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const PRIMARY_WINDOW_HOURS = 24;
const FALLBACK_WINDOW_HOURS = 48;
const MIN_ARTICLES_FOR_PRIMARY_WINDOW = 20;
const MAX_ARTICLES_IN_PROMPT = 120;
const MAX_SUMMARY_CHARS = 240;
const MAX_CLUSTERS = 10;
const MAX_ARTICLES_PER_CLUSTER = 5;

const EDITOR_SCAN_PROMPT = `You are Arc's news editor. You receive a list of recent articles (id, outlet, title, summary) and a list of running events. Group the articles into story clusters and rank them by real-world significance.

Return ONLY valid JSON (no markdown, no prose) in this exact shape:

{
  "clusters": [
    {
      "topic": "short label, e.g. Fed holds rates",
      "why_it_matters": "one factual line",
      "importance": 1,
      "article_ids": ["article id from the input"],
      "suggested_event": "match:<event_id>" | "propose:<title>" | "none"
    }
  ]
}

Cluster purity:
- An article joins a cluster ONLY if its own title and summary are about that specific story. Being adjacent in topic, region, or theme is not enough.
- Before adding an article, check that its title names the same event as the rest of the cluster. If it does not, leave it out.
- Never cluster photo galleries, "photos of the day", picture roundups, roundups, digests, or daily-briefing items with anything. Drop them.
- Two articles about different events never belong together. NEVER merge different stories to fill out a cluster.
- A market-sentiment column or opinion piece is never part of a news cluster. Give it its own cluster or drop it.
- Each cluster holds 1 to 5 article ids. Use only ids present in the input. Never invent ids.

Coverage (a separate concern from purity — do not trade one for the other):
- Single-article clusters are fine and expected. A story covered by only one outlet is still a story and still belongs in the list.
- Aim for 6 to 10 clusters when the day's news supports it. Do not stop at three because only three stories had multi-outlet coverage.
- Return at most 10 clusters.

Ranking:
- importance is 1-5 where 5 = major national or global significance, 1 = minor. Rank by real-world consequence, not virality or headline drama.
- Order clusters by importance descending.
- Skip sports scores, celebrity gossip, product deals, discounts, reviews, and listicles entirely.

Event matching:
- "match:<event_id>" ONLY when the cluster is a development in that same ongoing situation — the next thing that happened in that specific thread, using that event's exact id.
- A story that shares a subject area but is a different thread is NOT a match. A lawsuit between AI companies is not a match for an AI-safety summit. A different country's election is not a match for another country's election.
- "propose:<title>" only when this situation will clearly keep producing ongoing news on its own. Never propose a title that already exists in the running events list — that is a match, not a proposal.
- Otherwise "none". Prefer "none" over a loose match or a weak proposal.

Voice:
- topic: short, concrete label naming the story.
- why_it_matters: ONE sentence stating the concrete consequence — what changes in the world, and for whom. Use the specific numbers, names, and places from the input.
- Never use framing verbs or commentary: highlights, underscores, emphasizes, reflects, signals, raises questions about, sheds light on, points to, is a reminder that, impacting. No opinion words. No predictions of importance.

Examples of why_it_matters:
BAD: "impacting investor confidence and stock performance"
GOOD: "A Hormuz deal would reopen the lane carrying a fifth of the world's oil."
BAD: "raises important questions about intellectual property"
GOOD: "Apple alleges its former employees took confidential designs to OpenAI."
BAD: "highlighting issues of climate change"
GOOD: "60,000 people were evacuated from Spokane."

- Never invent facts. Everything in topic and why_it_matters must come from the provided titles and summaries.`;

/** Digests, galleries, and opinion have no single story to draft from. */
const NON_STORY_TITLE_PATTERNS: RegExp[] = [
  /photos? of the (day|week)/i,
  /\bin pictures\b/i,
  /\bin photos\b/i,
  /\bbriefing\b/i,
  /\broundup\b/i,
  /\bround-up\b/i,
  /\bdigest\b/i,
  /what to know/i,
  /(things|what) to watch/i,
  /\bsays one\b/i,
  /\bopinion\b/i,
  /\bcolumn\b/i,
  /\banalysis:/i,
];

function isNonStoryItem(title: string): boolean {
  return NON_STORY_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

/** Comparison key for event titles, so proposals can't duplicate a running event. */
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

type ArticleRow = {
  id: string;
  title: string;
  summary: string | null;
  link: string | null;
  published_at: string | null;
  feeds: { source_name: string | null } | { source_name: string | null }[] | null;
};

type ScanArticle = {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  published_at: string | null;
};

type ClusterOut = {
  topic: string;
  why_it_matters: string;
  importance: number;
  article_ids: string[];
  suggested_event: string;
  articles: Array<{ id: string; title: string; source_name: string }>;
  matched_event: { id: string; title: string } | null;
  proposed_event_title: string | null;
};

function sourceNameOf(row: ArticleRow): string {
  const feeds = row.feeds;
  if (!feeds) return "Unknown";
  const first = Array.isArray(feeds) ? feeds[0] : feeds;
  return first?.source_name?.trim() || "Unknown";
}

function compact(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen)}…`;
}

function buildArticleBlock(articles: ScanArticle[]): string {
  return articles
    .map(
      (a) =>
        `- id: ${a.id}\n  outlet: ${a.sourceName}\n  title: ${a.title}\n  summary: ${a.summary || "(none)"}`,
    )
    .join("\n");
}

export async function POST() {
  try {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return NextResponse.json(
        { error: "Server misconfigured", details: "Missing Supabase env" },
        { status: 500 },
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfigured", details: "Missing OPENAI_API_KEY" },
        { status: 500 },
      );
    }

    const supabase = createAdminClient();

    const activeUrls = DEFAULT_FEEDS.map((f) => f.url);
    const { data: feedRows, error: feedErr } = await supabase
      .from("feeds")
      .select("id,url")
      .in("url", activeUrls);

    if (feedErr) {
      return NextResponse.json(
        { error: "Failed to load feeds", details: feedErr.message },
        { status: 500 },
      );
    }

    const feedIds = (feedRows ?? []).map((f) => f.id as string);
    if (feedIds.length === 0) {
      return NextResponse.json(
        { error: "No active feeds found. Run a news sync first." },
        { status: 400 },
      );
    }

    const loadWindow = async (hours: number): Promise<ArticleRow[]> => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("articles")
        .select("id,title,summary,link,published_at,feeds(source_name)")
        .in("feed_id", feedIds)
        .gte("published_at", since)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(400);

      if (error) {
        throw new Error(error.message);
      }

      // Liveblogs were skipped at sync time, but older rows predate that filter.
      return ((data ?? []) as unknown as ArticleRow[]).filter(
        (row) =>
          !isLiveblogItem(row.link ?? "", row.title ?? "") &&
          !isNonStoryItem(row.title ?? ""),
      );
    };

    let windowHours = PRIMARY_WINDOW_HOURS;
    let rows = await loadWindow(PRIMARY_WINDOW_HOURS);
    if (rows.length < MIN_ARTICLES_FOR_PRIMARY_WINDOW) {
      windowHours = FALLBACK_WINDOW_HOURS;
      rows = await loadWindow(FALLBACK_WINDOW_HOURS);
    }

    if (rows.length === 0) {
      return NextResponse.json({
        window_hours: windowHours,
        articles_scanned: 0,
        clusters: [],
      });
    }

    const articles: ScanArticle[] = rows
      .slice(0, MAX_ARTICLES_IN_PROMPT)
      .map((row) => ({
        id: row.id,
        title: compact(row.title ?? "", 160),
        summary: compact(row.summary ?? "", MAX_SUMMARY_CHARS),
        sourceName: sourceNameOf(row),
        published_at: row.published_at,
      }));

    const byId = new Map(articles.map((a) => [a.id, a]));

    const { data: runningRows, error: runningErr } = await supabase
      .from("events")
      .select("id,title")
      .eq("status", "running");

    if (runningErr) {
      return NextResponse.json(
        { error: "Failed to load running events", details: runningErr.message },
        { status: 500 },
      );
    }

    const running = (runningRows ?? []) as Array<{ id: string; title: string }>;
    const runningById = new Map(running.map((e) => [e.id, e]));
    const runningByTitle = new Map(
      running.map((e) => [normalizeTitle(e.title), e]),
    );
    const runningBlock =
      running.length === 0
        ? "(none — no running events yet)"
        : running.map((e) => `- id: ${e.id}\n  title: ${e.title}`).join("\n");

    const userMessage = `Running events (candidates for match):\n${runningBlock}\n\nArticles from the last ${windowHours} hours:\n${buildArticleBlock(articles)}`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: EDITOR_SCAN_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json(
        { error: "OpenAI returned empty response" },
        { status: 500 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "OpenAI returned invalid JSON", raw },
        { status: 500 },
      );
    }

    const clustersRaw = Array.isArray((parsed as { clusters?: unknown })?.clusters)
      ? ((parsed as { clusters: unknown[] }).clusters)
      : [];

    const clusters: ClusterOut[] = [];

    for (const item of clustersRaw) {
      if (!item || typeof item !== "object") continue;
      const c = item as Record<string, unknown>;

      const topic = typeof c.topic === "string" ? c.topic.trim() : "";
      if (!topic) continue;

      const ids = Array.isArray(c.article_ids)
        ? c.article_ids.filter((v): v is string => typeof v === "string")
        : [];
      const validIds = [...new Set(ids)]
        .filter((id) => byId.has(id))
        .slice(0, MAX_ARTICLES_PER_CLUSTER);
      if (validIds.length === 0) continue;

      const importanceRaw =
        typeof c.importance === "number" ? Math.round(c.importance) : 0;
      const importance = Math.min(5, Math.max(1, importanceRaw || 1));

      const suggestedRaw =
        typeof c.suggested_event === "string" ? c.suggested_event.trim() : "none";

      let suggested = "none";
      let matchedEvent: { id: string; title: string } | null = null;
      let proposedTitle: string | null = null;

      if (suggestedRaw.startsWith("match:")) {
        const eventId = suggestedRaw.slice("match:".length).trim();
        const found = runningById.get(eventId);
        if (found) {
          suggested = `match:${eventId}`;
          matchedEvent = { id: found.id, title: found.title };
        }
      } else if (suggestedRaw.startsWith("propose:")) {
        const title = suggestedRaw.slice("propose:".length).trim();
        // A proposal that reuses a running event's title is that event, not a new one.
        const duplicate = title ? runningByTitle.get(normalizeTitle(title)) : undefined;
        if (duplicate) {
          suggested = `match:${duplicate.id}`;
          matchedEvent = { id: duplicate.id, title: duplicate.title };
        } else if (title) {
          suggested = `propose:${title}`;
          proposedTitle = title;
        }
      }

      clusters.push({
        topic,
        why_it_matters:
          typeof c.why_it_matters === "string" ? c.why_it_matters.trim() : "",
        importance,
        article_ids: validIds,
        suggested_event: suggested,
        articles: validIds.map((id) => {
          const a = byId.get(id)!;
          return { id: a.id, title: a.title, source_name: a.sourceName };
        }),
        matched_event: matchedEvent,
        proposed_event_title: proposedTitle,
      });
    }

    clusters.sort((a, b) => b.importance - a.importance);

    return NextResponse.json({
      window_hours: windowHours,
      articles_scanned: articles.length,
      clusters: clusters.slice(0, MAX_CLUSTERS),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 },
    );
  }
}
