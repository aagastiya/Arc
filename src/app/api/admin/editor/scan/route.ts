// Arc AI editor — scan, cluster, rank.
// POST /api/admin/editor/scan
// Reads recent articles from active feeds and asks OpenAI to group them into
// story clusters ranked by real-world significance. One pass per category, so a
// heavy news day in one genre cannot crowd the others out of the list.
// Never publishes anything.

import { NextResponse } from "next/server";
import OpenAI from "openai";

import { DEFAULT_FEEDS } from "@/config/feeds";
import {
  CANONICAL_CATEGORY_ORDER,
  normalizeStoryCategory,
  type StoryCategoryBucket,
} from "@/lib/categories";
import {
  clusterSizeDistribution,
  consolidateByDenseKeywords,
  selectOverlapPreserving,
  significantTitleKeywords,
  splitIncoherentGroup,
  unusedMultiOutletCohorts,
} from "@/lib/arc/scan-candidates";
import { isLiveblogItem } from "@/lib/rss/sync-feeds";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const PRIMARY_WINDOW_HOURS = 24;
const FALLBACK_WINDOW_HOURS = 48;
const MIN_ARTICLES_FOR_PRIMARY_WINDOW = 20;
/** Raised so heavy multi-outlet days keep shared-story groups in budget. */
const MAX_ARTICLES_PER_CATEGORY = 160;
const MAX_SUMMARY_CHARS = 220;
const TARGET_CLUSTERS_PER_CATEGORY = 10;
const MAX_CLUSTERS_PER_CATEGORY = 18;
/** Cap per cluster — enough for heavy coverage without flooding generation. */
const MAX_ARTICLES_PER_CLUSTER = 14;

const SCAN_BUCKETS: StoryCategoryBucket[] = [...CANONICAL_CATEGORY_ORDER, "Other"];

const EDITOR_SCAN_PROMPT = `You are Arc's news editor. You receive a list of recent articles (id, outlet, title, summary) from ONE section of the paper, and a list of running events. Group the articles into story clusters and rank them by real-world significance.

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
- An article joins a cluster ONLY if it covers the same underlying event as the rest of the cluster.
- MERGE BIAS (same event, different headlines): The SAME event reported with different headlines, angles, or lead details across outlets MUST be one cluster. Put every outlet covering that event in the same article_ids list.
  Example 1 — ONE cluster: "Trump denies munitions shortage" (NPR) + "Pentagon stockpile scrutiny grows" (Politico) + "White House pushes back on arms claims" (The Hill). Same underlying dispute about US munitions stocks.
  Example 2 — ONE cluster: "Fauci faces congressional grilling over pandemic emails" (NBC) + "Lawmakers press Fauci on lab-leak answers" (Washington Post). Same hearing / same day of testimony.
  Example 3 — TWO clusters (keep separate): "OpenAI launches new model" + "Anthropic raises Series E". Same industry, different events.
- Name collisions are NOT the same event. "Chuck Todd" is not "Todd Blanche". A shared surname or first name never merges stories.
- Digest / pulse / roundup items that name multiple unrelated topics in one title belong in no cluster — drop them.
- Being adjacent in topic, region, theme, or industry is NOT the same event. Two different films, two different companies, two different votes, two different countries' elections are separate stories.
- Never cluster photo galleries, "photos of the day", picture roundups, roundups, digests, or daily-briefing items with anything. Drop them.
- NEVER merge genuinely different stories to fill out a cluster. A bigger cluster is not a better cluster — but under-merging one event into several single-outlet clusters is also wrong.
- A market-sentiment column, review, or opinion piece is never part of a news cluster. Give it its own cluster or drop it.
- A cluster is ONE event. If the only label that fits a group is a category rather than an event — "New films and trailers", "Emerging trends in media", "Market movers", "AI news" — it is not a cluster. Split it into the real stories or drop it.
- Each cluster holds 1 to ${MAX_ARTICLES_PER_CLUSTER} article ids. Prefer including every outlet that covers the event (up to the cap). Use only ids present in the input. Never invent ids.

Coverage (a separate concern from purity — do not trade one for the other):
- Single-article clusters are fine when only one outlet covered the story. Do not invent siblings.
- When several outlets clearly cover the same event, returning them as separate 1-article clusters is a failure — merge them.
- Every input article is a candidate. Work through the whole list to the last entry, not just the first few.
- Return ${TARGET_CLUSTERS_PER_CATEGORY} to ${MAX_CLUSTERS_PER_CATEGORY} clusters. If the section has 30 or more articles it has at least ${TARGET_CLUSTERS_PER_CATEGORY} distinct stories in it — find them. Returning fewer is only correct when the section truly has fewer separate stories.
- A smaller story is not a reason to leave it out; give it a low importance instead.
- Never pad the list by splitting one story into several clusters, and never merge separate stories to reach the count.
- Return at most ${MAX_CLUSTERS_PER_CATEGORY} clusters.

Ranking:
- importance is 1-5 where 5 = major national or global significance, 1 = minor. Rank by real-world consequence, not virality or headline drama.
- Judge importance within this section: a 5 in Culture is the biggest story in culture, not a story that rivals a war.
- Order clusters by importance descending. When two clusters share an importance score, put the one with more outlets first.
- Skip sports scores, celebrity gossip, product deals, discounts, reviews, and listicles entirely.

Event matching:
- "match:<event_id>" ONLY when the cluster is a development in that same ongoing situation — the next thing that happened in that specific thread, using that event's exact id.
- A story that shares a subject area but is a different thread is NOT a match. A lawsuit between AI companies is not a match for an AI-safety summit. A different country's election is not a match for another country's election.
- "propose:<title>" only when this situation will clearly keep producing ongoing news on its own. Never propose a title that already exists in the running events list — that is a match, not a proposal.
- Otherwise "none". Prefer "none" over a loose match or a weak proposal.

Voice:
- topic: short, concrete label naming the story.
- why_it_matters: REQUIRED on every cluster, never blank. ONE sentence stating the concrete consequence — what changes in the world, and for whom. Use the specific numbers, names, and places from the input. If you cannot state a consequence from the input, the cluster does not belong in the list.
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
  category: string | null;
  published_at: string | null;
  feeds: { source_name: string | null } | { source_name: string | null }[] | null;
};

type ScanArticle = {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  category: StoryCategoryBucket;
  published_at: string | null;
};

type BucketLoad = {
  candidatesInWindow: number;
  articles: ScanArticle[];
};

/** A story already drafted from a cluster's articles, so it is never drafted twice. */
type ExistingStory = {
  id: string;
  headline: string;
  importance: number | null;
  /** null when the story predates verification or the pass failed. */
  flags: number | null;
};

type ClusterOut = {
  topic: string;
  why_it_matters: string;
  importance: number;
  category: StoryCategoryBucket;
  article_ids: string[];
  source_count: number;
  suggested_event: string;
  articles: Array<{
    id: string;
    title: string;
    source_name: string;
    published_at: string | null;
  }>;
  matched_event: { id: string; title: string } | null;
  proposed_event_title: string | null;
  existing_story: ExistingStory | null;
};

type RunningEvent = { id: string; title: string };

type EventIndex = {
  block: string;
  byId: Map<string, RunningEvent>;
  byTitle: Map<string, RunningEvent>;
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

/** The feed slugs that land in each section, derived from the live feed config. */
function slugsByBucket(): Map<StoryCategoryBucket, string[]> {
  const map = new Map<StoryCategoryBucket, Set<string>>();
  for (const feed of DEFAULT_FEEDS) {
    const bucket = normalizeStoryCategory(feed.category);
    const set = map.get(bucket) ?? new Set<string>();
    set.add(feed.category);
    map.set(bucket, set);
  }
  return new Map([...map].map(([bucket, set]) => [bucket, [...set]]));
}

function parseClusters(
  parsed: unknown,
  bucket: StoryCategoryBucket,
  byId: Map<string, ScanArticle>,
  events: EventIndex,
): ClusterOut[] {
  const clustersRaw = Array.isArray((parsed as { clusters?: unknown })?.clusters)
    ? (parsed as { clusters: unknown[] }).clusters
    : [];

  const clusters: ClusterOut[] = [];

  for (const item of clustersRaw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;

    const topic = typeof c.topic === "string" ? c.topic.trim() : "";
    if (!topic) continue;

    // A cluster with nothing to say about consequence is a filler grouping.
    const whyItMatters =
      typeof c.why_it_matters === "string" ? c.why_it_matters.trim() : "";
    if (!whyItMatters) continue;

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
    let matchedEvent: RunningEvent | null = null;
    let proposedTitle: string | null = null;

    if (suggestedRaw.startsWith("match:")) {
      const eventId = suggestedRaw.slice("match:".length).trim();
      const found = events.byId.get(eventId);
      if (found) {
        suggested = `match:${eventId}`;
        matchedEvent = { id: found.id, title: found.title };
      }
    } else if (suggestedRaw.startsWith("propose:")) {
      const title = suggestedRaw.slice("propose:".length).trim();
      // A proposal that reuses a running event's title is that event, not a new one.
      const duplicate = title ? events.byTitle.get(normalizeTitle(title)) : undefined;
      if (duplicate) {
        suggested = `match:${duplicate.id}`;
        matchedEvent = { id: duplicate.id, title: duplicate.title };
      } else if (title) {
        suggested = `propose:${title}`;
        proposedTitle = title;
      }
    }

    const members = validIds.map((id) => byId.get(id)!);
    const coherentGroups = splitIncoherentGroup(members).sort(
      (a, b) => b.length - a.length,
    );

    for (let gi = 0; gi < coherentGroups.length; gi++) {
      const group = coherentGroups[gi]!;
      const groupIds = group.map((a) => a.id);
      // Primary subgroup keeps the model topic; splinters get a title label.
      const groupTopic =
        gi === 0 ? topic : compact(group[0]!.title, 80);
      clusters.push({
        topic: groupTopic,
        why_it_matters: whyItMatters,
        importance,
        category: bucket,
        article_ids: groupIds,
        source_count: groupIds.length,
        suggested_event: suggested,
        articles: group.map((a) => ({
          id: a.id,
          title: a.title,
          source_name: a.sourceName,
          published_at: a.published_at,
        })),
        matched_event: matchedEvent,
        proposed_event_title: proposedTitle,
        existing_story: null,
      });
    }
  }

  return clusters
    .sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      // Multi-source coverage outranks single-outlet at equal importance.
      return b.source_count - a.source_count;
    })
    .slice(0, MAX_CLUSTERS_PER_CATEGORY);
}

/**
 * Stories already written from these articles, newest first per article. Lets the
 * panel show a finished pick as done instead of offering to draft it again.
 */
async function loadExistingStories(
  supabase: ReturnType<typeof createAdminClient>,
  articleIds: string[],
): Promise<Map<string, ExistingStory>> {
  const byArticle = new Map<string, ExistingStory>();
  if (articleIds.length === 0) {
    return byArticle;
  }

  const { data: links, error: linkErr } = await supabase
    .from("story_articles")
    .select("story_id,article_id")
    .in("article_id", articleIds);

  if (linkErr || !links || links.length === 0) {
    if (linkErr) {
      console.error("[editor/scan] story_articles lookup failed:", linkErr.message);
    }
    return byArticle;
  }

  const storyIds = [...new Set(links.map((l) => l.story_id as string))];
  const { data: stories, error: storyErr } = await supabase
    .from("stories")
    .select("id,arc_headline,importance,verification,created_at")
    .in("id", storyIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (storyErr || !stories) {
    if (storyErr) {
      console.error("[editor/scan] story lookup failed:", storyErr.message);
    }
    return byArticle;
  }

  const rank = new Map(stories.map((s, index) => [s.id as string, index]));
  const byId = new Map(
    stories.map((s) => {
      const verification = s.verification as { flags?: unknown[] } | null;
      return [
        s.id as string,
        {
          id: s.id as string,
          headline: (s.arc_headline as string) ?? "(untitled)",
          importance: (s.importance as number | null) ?? null,
          flags: Array.isArray(verification?.flags)
            ? verification.flags.length
            : null,
        } satisfies ExistingStory,
      ];
    }),
  );

  for (const link of links) {
    const story = byId.get(link.story_id as string);
    if (!story) continue;

    // Stories are ordered newest first, so a lower rank wins.
    const current = byArticle.get(link.article_id as string);
    if (
      !current ||
      (rank.get(story.id) ?? Infinity) < (rank.get(current.id) ?? Infinity)
    ) {
      byArticle.set(link.article_id as string, story);
    }
  }

  return byArticle;
}

/** One model pass over a single section's articles. */
async function scanCategory(
  openai: OpenAI,
  bucket: StoryCategoryBucket,
  articles: ScanArticle[],
  events: EventIndex,
  windowHours: number,
): Promise<ClusterOut[]> {
  const byId = new Map(articles.map((a) => [a.id, a]));

  const userMessage = `Section: ${bucket}\n\nRunning events (candidates for match):\n${events.block}\n\nEvery article below is from the ${bucket} section, published in the last ${windowHours} hours:\n${buildArticleBlock(articles)}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: EDITOR_SCAN_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error(`${bucket}: OpenAI returned an empty response`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${bucket}: OpenAI returned invalid JSON`);
  }

  const modelClusters = parseClusters(parsed, bucket, byId, events);
  const consolidated = applyDenseKeywordConsolidation(
    bucket,
    articles,
    modelClusters,
  );
  const minted = mintCohortClusters(bucket, articles, consolidated);
  if (minted.length > 0) {
    console.info(
      `[editor/scan] ${bucket}: minted ${minted.length} unused multi-outlet cohort(s)`,
      minted.map((c) => `${c.topic.slice(0, 40)}… (${c.source_count})`),
    );
  }
  const combined = [...consolidated, ...minted].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return b.source_count - a.source_count;
  });
  return combined.slice(0, MAX_CLUSTERS_PER_CATEGORY);
}

function applyDenseKeywordConsolidation(
  bucket: StoryCategoryBucket,
  articles: ScanArticle[],
  clusters: ClusterOut[],
): ClusterOut[] {
  const merges = consolidateByDenseKeywords(articles, clusters, {
    minSize: 3,
    maxPerCluster: MAX_ARTICLES_PER_CLUSTER,
  });
  if (merges.length === 0) return clusters;

  const absorb = new Set(
    merges.flatMap((m) => m.groups.flatMap((g) => g.map((a) => a.id))),
  );
  // Drop absorbed ids from existing clusters; keep remnant clusters intact.
  const kept: ClusterOut[] = [];
  for (const c of clusters) {
    const remaining = c.article_ids.filter((id) => !absorb.has(id));
    if (remaining.length === 0) continue;
    if (remaining.length === c.article_ids.length) {
      kept.push(c);
      continue;
    }
    const byId = new Map(c.articles.map((a) => [a.id, a]));
    const remArticles = remaining.map((id) => byId.get(id)!).filter(Boolean);
    kept.push({
      ...c,
      article_ids: remaining,
      source_count: remaining.length,
      articles: remArticles,
    });
  }

  const built: ClusterOut[] = [];
  for (const m of merges) {
    for (const members of m.groups) {
      built.push({
        topic: compact(
          members.length >= 4 ? m.seedTopic : members[0]!.title,
          80,
        ),
        why_it_matters: `${members.length} outlets reported on this ${m.keyword} story in the scan window.`,
        importance: m.importance,
        category: bucket,
        article_ids: members.map((a) => a.id),
        source_count: members.length,
        suggested_event: "none",
        articles: members.map((a) => ({
          id: a.id,
          title: a.title,
          source_name: a.sourceName,
          published_at: a.published_at,
        })),
        matched_event: null,
        proposed_event_title: null,
        existing_story: null,
      });
    }
  }

  console.info(
    `[editor/scan] ${bucket}: consolidated ${built.length} dense keyword group(s)`,
    built.map((c) => `${c.topic.slice(0, 40)}… (${c.source_count})`),
  );

  return [...built, ...kept];
}

function mintCohortClusters(
  bucket: StoryCategoryBucket,
  articles: ScanArticle[],
  existing: ClusterOut[],
): ClusterOut[] {
  const used = new Set(existing.flatMap((c) => c.article_ids));
  const cohorts = unusedMultiOutletCohorts(articles, used, 3);
  const minted: ClusterOut[] = [];

  for (const cohort of cohorts) {
    if (minted.length >= 6) break;
    const capped = cohort.slice(0, MAX_ARTICLES_PER_CLUSTER);
    // Skip weakly distinctive cohorts (generic shared verbs/nouns).
    const shared = significantSharedKeyword(capped);
    if (!shared) continue;
    const topic = compact(capped[0]!.title, 80);
    minted.push({
      topic,
      why_it_matters: `${capped.length} outlets reported on this ${shared} story in the scan window.`,
      importance: Math.min(5, Math.max(3, Math.round(capped.length / 2))),
      category: bucket,
      article_ids: capped.map((a) => a.id),
      source_count: capped.length,
      suggested_event: "none",
      articles: capped.map((a) => ({
        id: a.id,
        title: a.title,
        source_name: a.sourceName,
        published_at: a.published_at,
      })),
      matched_event: null,
      proposed_event_title: null,
      existing_story: null,
    });
    for (const a of capped) used.add(a.id);
  }

  return minted;
}

/** Keyword that appears in every title of a cohort — empty if none. */
function significantSharedKeyword(articles: ScanArticle[]): string | null {
  if (articles.length === 0) return null;
  const sets = articles.map(
    (a) => new Set(significantTitleKeywords(a.title)),
  );
  const first = [...sets[0]!];
  const shared = first.filter((kw) => sets.every((s) => s.has(kw)));
  if (shared.length === 0) return null;
  // Prefer rarer / longer tokens.
  shared.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return shared[0] ?? null;
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

    const bucketSlugs = slugsByBucket();
    const buckets = SCAN_BUCKETS.filter((bucket) => bucketSlugs.has(bucket));

    // Loaded per section rather than as one recency-ordered list, so a busy
    // section cannot use up the row budget belonging to a quiet one.
    const loadBucket = async (
      bucket: StoryCategoryBucket,
      hours: number,
    ): Promise<BucketLoad> => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("articles")
        .select("id,title,summary,link,category,published_at,feeds(source_name)")
        .in("feed_id", feedIds)
        .in("category", bucketSlugs.get(bucket) ?? [])
        .gte("published_at", since)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(MAX_ARTICLES_PER_CATEGORY * 5);

      if (error) {
        throw new Error(error.message);
      }

      // Liveblogs were skipped at sync time, but older rows predate that filter.
      const filtered = ((data ?? []) as unknown as ArticleRow[]).filter(
        (row) =>
          !isLiveblogItem(row.link ?? "", row.title ?? "") &&
          !isNonStoryItem(row.title ?? ""),
      );

      const mapped: ScanArticle[] = filtered.map((row) => ({
        id: row.id,
        title: compact(row.title ?? "", 160),
        summary: compact(row.summary ?? "", MAX_SUMMARY_CHARS),
        sourceName: sourceNameOf(row),
        category: normalizeStoryCategory(row.category ?? ""),
        published_at: row.published_at,
      }));

      const selected = selectOverlapPreserving(
        mapped,
        MAX_ARTICLES_PER_CATEGORY,
      );

      return {
        candidatesInWindow: mapped.length,
        articles: selected,
      };
    };

    const loadWindow = async (hours: number) =>
      new Map(
        await Promise.all(
          buckets.map(
            async (bucket) =>
              [bucket, await loadBucket(bucket, hours)] as const,
          ),
        ),
      );

    let windowHours = PRIMARY_WINDOW_HOURS;
    let byBucket = await loadWindow(PRIMARY_WINDOW_HOURS);
    const total = (map: Map<StoryCategoryBucket, BucketLoad>) =>
      [...map.values()].reduce((sum, load) => sum + load.articles.length, 0);

    if (total(byBucket) < MIN_ARTICLES_FOR_PRIMARY_WINDOW) {
      windowHours = FALLBACK_WINDOW_HOURS;
      byBucket = await loadWindow(FALLBACK_WINDOW_HOURS);
    }

    const articlesScanned = total(byBucket);
    if (articlesScanned === 0) {
      return NextResponse.json({
        window_hours: windowHours,
        articles_scanned: 0,
        per_category: [],
        clusters: [],
      });
    }

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

    const running = (runningRows ?? []) as RunningEvent[];
    const events: EventIndex = {
      byId: new Map(running.map((e) => [e.id, e])),
      byTitle: new Map(running.map((e) => [normalizeTitle(e.title), e])),
      block:
        running.length === 0
          ? "(none — no running events yet)"
          : running.map((e) => `- id: ${e.id}\n  title: ${e.title}`).join("\n"),
    };

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const active = buckets.filter(
      (bucket) => (byBucket.get(bucket)?.articles.length ?? 0) > 0,
    );

    // Sections run together; one failing section still leaves a usable list.
    const settled = await Promise.allSettled(
      active.map((bucket) =>
        scanCategory(
          openai,
          bucket,
          byBucket.get(bucket)?.articles ?? [],
          events,
          windowHours,
        ),
      ),
    );

    const clusters: ClusterOut[] = [];
    const perCategory: Array<{
      category: StoryCategoryBucket;
      candidates_in_window: number;
      sent_to_model: number;
      clusters: number;
      size_distribution: { one: number; two: number; three_plus: number };
    }> = [];
    const warnings: string[] = [];

    active.forEach((bucket, index) => {
      const result = settled[index]!;
      const found = result.status === "fulfilled" ? result.value : [];
      const load = byBucket.get(bucket)!;
      const dist = clusterSizeDistribution(found.map((c) => c.source_count));

      if (result.status === "rejected") {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        console.error(`[editor/scan] ${bucket} failed:`, message);
        warnings.push(message);
      }

      console.log(
        `[editor/scan] ${bucket}: candidates_in_window=${load.candidatesInWindow} sent_to_model=${load.articles.length} clusters=${found.length} sizes={1:${dist.one}, 2:${dist.two}, 3+:${dist.threePlus}}`,
      );

      clusters.push(...found);
      perCategory.push({
        category: bucket,
        candidates_in_window: load.candidatesInWindow,
        sent_to_model: load.articles.length,
        clusters: found.length,
        size_distribution: {
          one: dist.one,
          two: dist.two,
          three_plus: dist.threePlus,
        },
      });
    });

    // Global rank: importance first, then multi-source over single-source.
    clusters.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return b.source_count - a.source_count;
    });

    const existing = await loadExistingStories(
      supabase,
      [...new Set(clusters.flatMap((c) => c.article_ids))],
    );
    for (const cluster of clusters) {
      cluster.existing_story =
        cluster.article_ids.map((id) => existing.get(id)).find(Boolean) ?? null;
    }

    return NextResponse.json({
      window_hours: windowHours,
      articles_scanned: articlesScanned,
      per_category: perCategory,
      clusters,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 },
    );
  }
}
