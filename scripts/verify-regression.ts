/**
 * Regression test for the fact-checking pass.
 *
 * Loads a real published story and its sources, plants four known defects
 * (changed number, invented fact, overstated claim, unsourced date), then runs
 * the verifier and reports which planted defects it caught. Reads from the
 * database but never writes: the verifier gets a client whose update is a no-op.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-regression.ts [storyId]
 */
import OpenAI from "openai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  verifyAndPersistStory,
  type VerifySource,
} from "../src/lib/arc/verify-story";
import { resolveSourceText } from "../src/lib/rss/extract-full-text";

// US–Iran story, four sources.
const DEFAULT_STORY_ID = "78aa904b-a14d-42d8-83cb-419916326efa";

const INVENTED_FACT =
  "France condemned the strikes and recalled its ambassador from Washington.";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const THREAT_VERBS: Record<string, string> = {
  destroy: "destroyed",
  strike: "struck",
  close: "closed",
  block: "blocked",
  blockade: "blockaded",
  impose: "imposed",
  target: "targeted",
  attack: "attacked",
  bomb: "bombed",
  seize: "seized",
  sanction: "sanctioned",
  retaliate: "retaliated",
  withdraw: "withdrew",
};

type KeyPoint = { text: string; source: string };
type ReportSection = { title: string; body: string };
type ArcReport = { lead: string; sections: ReportSection[] };

type StoryDraft = {
  headline: string;
  summary: string;
  keyPoints: KeyPoint[];
  report: ArcReport | null;
};

type StoryRow = {
  id: string;
  article_id: string | null;
  arc_headline: string | null;
  arc_summary: string | null;
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

/** A writable slot of story prose, in the order the verifier sees it. */
type Slot = {
  label: string;
  get: () => string;
  set: (value: string) => void;
};

type Defect = {
  id: string;
  label: string;
  /** Returns the marker a flag must quote, or null when it could not be planted. */
  plant: (
    story: StoryDraft,
    used: Set<string>,
  ) => { marker: string; slot: string; text: string } | null;
  /** Extra spellings to look for when checking the sources don't support the defect. */
  sourceProbes?: string[];
};

function parseKeyPoints(value: unknown): KeyPoint[] {
  if (!Array.isArray(value)) return [];
  const points: KeyPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.text !== "string") continue;
    points.push({
      text: entry.text,
      source: typeof entry.source === "string" ? entry.source : "",
    });
  }
  return points;
}

function parseReport(value: unknown): ArcReport | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.lead !== "string") return null;
  const sectionsRaw = Array.isArray(obj.sections) ? obj.sections : [];
  const sections: ReportSection[] = [];
  for (const item of sectionsRaw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.title !== "string" || typeof s.body !== "string") continue;
    sections.push({ title: s.title, body: s.body });
  }
  return { lead: obj.lead, sections };
}

/** Every spelling of a date that would count as source support. */
function dateVariants(monthIndex: number, day: number, year: number): string[] {
  const month = MONTHS[monthIndex]!.toLowerCase();
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return [
    `${month} ${day}`,
    `${month.slice(0, 3)} ${day}`,
    `${day} ${month}`,
    `${day} ${month.slice(0, 3)}`,
    `${monthIndex + 1}/${day}`,
    `${mm}/${dd}`,
    `${year}-${mm}-${dd}`,
  ];
}

/** Dates the sources do mention — useful when a date flag looks arguable. */
function sourceDates(sources: VerifySource[]): string[] {
  const blob = sources.map((s) => `${s.title}\n${s.text}`).join("\n");
  const months = MONTHS.join("|");
  const pattern = new RegExp(
    `\\b(?:${months})\\s+\\d{1,2}(?:,?\\s+\\d{4})?|\\b\\d{1,2}\\s+(?:${months})(?:,?\\s+\\d{4})?`,
    "gi",
  );
  return [...new Set([...blob.matchAll(pattern)].map((m) => m[0]!.trim()))];
}

/**
 * A date the sources never mention, so the defect is genuinely unsourced.
 * Stays close to the story's own timeframe rather than picking an absurd year.
 */
function pickUnsourcedDate(
  sources: VerifySource[],
  year: number,
): { text: string; variants: string[] } | null {
  const blob = sources
    .map((s) => `${s.title}\n${s.text}`)
    .join("\n")
    .toLowerCase();

  for (let monthIndex = 0; monthIndex < MONTHS.length; monthIndex++) {
    for (let day = 1; day <= 28; day++) {
      const variants = dateVariants(monthIndex, day, year);
      if (variants.some((variant) => blob.includes(variant))) continue;
      return { text: `${MONTHS[monthIndex]} ${day}, ${year}`, variants };
    }
  }
  return null;
}

function slots(story: StoryDraft): Slot[] {
  const list: Slot[] = [
    {
      label: "headline",
      get: () => story.headline,
      set: (v) => {
        story.headline = v;
      },
    },
    {
      label: "standfirst",
      get: () => story.summary,
      set: (v) => {
        story.summary = v;
      },
    },
  ];

  story.keyPoints.forEach((point, index) => {
    list.push({
      label: `key point ${index + 1}`,
      get: () => point.text,
      set: (v) => {
        point.text = v;
      },
    });
  });

  const report = story.report;
  if (report) {
    list.push({
      label: "report lead",
      get: () => report.lead,
      set: (v) => {
        report.lead = v;
      },
    });
    report.sections.forEach((section, index) => {
      list.push({
        label: `section ${index + 1} (${section.title})`,
        get: () => section.body,
        set: (v) => {
          section.body = v;
        },
      });
    });
  }

  return list;
}

/**
 * Rewrite the first untouched slot whose text matches. One defect per slot, so
 * a single flag can never stand in for two planted defects.
 */
function editFirstMatch(
  story: StoryDraft,
  used: Set<string>,
  pattern: RegExp,
  rewrite: (match: RegExpMatchArray) => { text: string; marker: string },
): { marker: string; slot: string; text: string } | null {
  for (const slot of slots(story)) {
    if (used.has(slot.label)) continue;
    const current = slot.get();
    const match = current.match(pattern);
    if (!match || match.index === undefined) continue;
    const { text, marker } = rewrite(match);
    slot.set(
      current.slice(0, match.index) +
        text +
        current.slice(match.index + match[0].length),
    );
    used.add(slot.label);
    return { marker, slot: slot.label, text };
  }
  return null;
}

function appendSentence(
  story: StoryDraft,
  used: Set<string>,
  sentence: string,
  preferLast: boolean,
): { marker: string; slot: string; text: string } | null {
  const prose = slots(story).filter(
    (slot) =>
      !used.has(slot.label) &&
      (slot.label === "report lead" || slot.label.startsWith("section ")),
  );
  const target = preferLast ? prose.at(-1) : prose[0];
  if (!target) return null;
  target.set(`${target.get().trim()} ${sentence}`);
  used.add(target.label);
  return { marker: sentence, slot: target.label, text: sentence };
}

function buildDefects(date: { text: string; variants: string[] }): Defect[] {
  return [
  {
    id: "changed_number",
    label: "changed number (figure the sources state differently)",
    plant: (story, used) => {
      const money = editFirstMatch(
        story,
        used,
        /\$\s?(\d[\d,]*)(?:\.\d+)?/,
        (match) => {
          const whole = Number(match[1]!.replace(/,/g, ""));
          const text = `$${whole + 50}`;
          return { text, marker: text };
        },
      );
      if (money) return money;

      const plain = editFirstMatch(story, used, /\b(\d[\d,]*)\b/, (match) => {
        const value = Number(match[1]!.replace(/,/g, ""));
        const text = String(value + 50);
        return { text, marker: text };
      });
      if (plain) return plain;

      return editFirstMatch(story, used, /\bone\b/, () => ({
        text: "seven",
        marker: "seven",
      }));
    },
  },
  {
    id: "invented_fact",
    label: "invented fact (actor the sources never place in this event)",
    plant: (story, used) => appendSentence(story, used, INVENTED_FACT, true),
  },
  {
    id: "overstatement",
    label: "overstated claim (threat written as a completed action)",
    plant: (story, used) => {
      const verbs = Object.keys(THREAT_VERBS).join("|");
      const threat = new RegExp(
        `(?:threatened to|vowed to|warned (?:that )?(?:he|she|they|it) would|said (?:he|she|they|it) would|would)\\s+(${verbs})\\b`,
        "i",
      );
      const rewritten = editFirstMatch(story, used, threat, (match) => {
        const past = THREAT_VERBS[match[1]!.toLowerCase()]!;
        const text = `has already ${past}`;
        return { text, marker: text };
      });
      if (rewritten) return rewritten;

      return editFirstMatch(
        story,
        used,
        /\b(?:could|may|might|plans to|is expected to)\s+([a-z]+)\b/i,
        (match) => {
          const text = `has already ${match[1]!.toLowerCase()}ed`;
          return { text, marker: text };
        },
      );
    },
  },
  {
    id: "unsourced_date",
    label: "unsourced date (calendar date no source gives)",
    plant: (story, used) => {
      // Sentence-final period only: skip the ones inside "U.S." and friends.
      const dated = editFirstMatch(story, used, /(?<=[a-z0-9)"])\.(?=\s|$)/, () => ({
        text: ` on ${date.text}.`,
        marker: date.text,
      }));
      if (dated) return dated;
      return appendSentence(story, used, `This happened on ${date.text}.`, false);
    },
    sourceProbes: date.variants,
  },
  ];
}

/** Verifier client that swallows the persistence write. */
function noWriteClient(): SupabaseClient {
  return {
    from: () => ({
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
}

function outletOf(article: ArticleRow): string {
  const feeds = article.feeds;
  const name = Array.isArray(feeds)
    ? feeds[0]?.source_name
    : (feeds?.source_name ?? null);
  return name || "unknown outlet";
}

async function loadStory(
  supabase: SupabaseClient,
  storyId: string,
): Promise<StoryRow> {
  const { data, error } = await supabase
    .from("stories")
    .select("id,article_id,arc_headline,arc_summary,arc_key_points,arc_report")
    .eq("id", storyId)
    .single();

  if (error || !data) {
    throw new Error(`Story ${storyId} not found: ${error?.message ?? "no row"}`);
  }
  return data as StoryRow;
}

async function loadSources(
  supabase: SupabaseClient,
  story: StoryRow,
): Promise<VerifySource[]> {
  const ids = new Set<string>();
  if (story.article_id) ids.add(story.article_id);

  const { data: links, error: linkErr } = await supabase
    .from("story_articles")
    .select("article_id")
    .eq("story_id", story.id);

  if (linkErr) {
    throw new Error(`Failed to load story_articles: ${linkErr.message}`);
  }
  for (const row of links ?? []) {
    if (row.article_id) ids.add(row.article_id as string);
  }

  if (ids.size === 0) return [];

  const { data: articles, error: artErr } = await supabase
    .from("articles")
    .select(
      "id,title,summary,link,full_text,full_text_fetched_at,full_text_failed_at,feeds(source_name)",
    )
    .in("id", [...ids]);

  if (artErr) {
    throw new Error(`Failed to load articles: ${artErr.message}`);
  }

  const stub = noWriteClient();
  const sources: VerifySource[] = [];
  for (const article of (articles ?? []) as ArticleRow[]) {
    const resolved = await resolveSourceText({
      supabase: stub,
      articleId: article.id,
      link: article.link,
      summary: article.summary,
      fullText: article.full_text,
      fullTextFetchedAt: article.full_text_fetched_at,
      fullTextFailedAt: article.full_text_failed_at,
    });
    console.log(
      `Source: ${article.id} — ${outletOf(article)} (${resolved.textLength} chars, ${resolved.quality})`,
    );
    sources.push({
      outlet: outletOf(article),
      title: article.title,
      text: resolved.text,
    });
  }
  return sources;
}

async function main(): Promise<void> {
  const storyId = process.argv[2] ?? DEFAULT_STORY_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
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

  const row = await loadStory(supabase, storyId);
  const sources = await loadSources(supabase, row);

  const story: StoryDraft = {
    headline: row.arc_headline ?? "",
    summary: row.arc_summary ?? "",
    keyPoints: parseKeyPoints(row.arc_key_points),
    report: parseReport(row.arc_report),
  };

  const date = pickUnsourcedDate(sources, new Date().getUTCFullYear());
  if (!date) {
    console.error("Could not find a date absent from the sources.");
    process.exit(1);
  }
  const defects = buildDefects(date);

  console.log(`Story:   ${storyId}`);
  console.log(`Sources: ${sources.length}`);
  console.log(`Dates the sources mention: ${sourceDates(sources).join(" | ") || "(none)"}`);
  console.log(`Date the sources never give: ${date.text}`);
  console.log(`Planting ${defects.length} defects\n`);

  const planted: Array<{ defect: Defect; marker: string }> = [];
  const used = new Set<string>();
  for (const defect of defects) {
    const result = defect.plant(story, used);
    if (!result) {
      console.log(`  SKIP  ${defect.id}: no place to plant it in this story`);
      continue;
    }
    planted.push({ defect, marker: result.marker });
    const slotText = slots(story).find((s) => s.label === result.slot)?.get() ?? "";
    console.log(`  ${defect.id} → ${result.slot}`);
    console.log(`        planted:   "${result.text}"`);
    console.log(`        now reads: "${slotText}"`);
  }

  if (planted.length === 0) {
    console.error("\nNothing planted — cannot assess the verifier.");
    process.exit(1);
  }

  // A defect the sources happen to support is not a defect; say so rather than
  // reporting it as a verifier miss.
  const sourceBlob = sources
    .map((s) => `${s.title}\n${s.text}`)
    .join("\n")
    .toLowerCase();
  for (const { defect, marker } of planted) {
    const probes = [marker, ...(defect.sourceProbes ?? [])];
    for (const probe of probes) {
      if (sourceBlob.includes(probe.toLowerCase())) {
        console.log(
          `\n  WARNING ${defect.id}: "${probe}" already appears in the sources — this defect may not be testable.`,
        );
      }
    }
  }

  const verification = await verifyAndPersistStory({
    openai,
    supabase: noWriteClient(),
    storyId,
    headline: story.headline,
    summary: story.summary,
    keyPoints: story.keyPoints,
    report: story.report,
    sources,
  });

  console.log("\n── Verification JSON ────────────────────────────────");
  console.log(JSON.stringify(verification, null, 2));

  const matched = new Set<number>();
  const caught: string[] = [];
  const missed: string[] = [];

  for (const { defect, marker } of planted) {
    const needle = marker.toLowerCase();
    const hit = verification.flags.findIndex((flag, index) => {
      if (matched.has(index)) return false;
      return flag.claim.toLowerCase().includes(needle);
    });
    if (hit >= 0) {
      matched.add(hit);
      const flag = verification.flags[hit]!;
      caught.push(`${defect.id} → ${flag.reason}: ${flag.note}`);
    } else {
      missed.push(`${defect.id} (expected a flag quoting "${marker}")`);
    }
  }

  const extra = verification.flags.filter((_, index) => !matched.has(index));

  console.log("\n── Result ───────────────────────────────────────────");
  console.log(`Claims checked: ${verification.claims_checked}`);
  console.log(`Planted:        ${planted.length}`);
  console.log(`Caught:         ${caught.length}`);
  for (const line of caught) console.log(`  ✓ ${line}`);
  if (missed.length > 0) {
    console.log(`Missed:         ${missed.length}`);
    for (const line of missed) console.log(`  ✗ ${line}`);
  }
  if (extra.length > 0) {
    console.log(`\nFlags on untouched text (check for false positives): ${extra.length}`);
    for (const flag of extra) {
      console.log(`  - [${flag.reason}] "${flag.claim}"\n      ${flag.note}`);
    }
  }

  if (missed.length > 0) {
    console.log("\nFAIL — the verifier let a planted defect through.");
    process.exit(1);
  }
  console.log("\nPASS — every planted defect was flagged.");
}

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
