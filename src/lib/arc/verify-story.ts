import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

export const VERIFY_STORY_PROMPT = `You are Arc's fact checker. You receive the source articles Arc wrote from, then the story Arc produced. Check the story's factual claims against those sources and return ONLY valid JSON (no markdown, no prose) in this exact shape:

{
  "checked": [
    "Part label — short description of one claim you examined"
  ],
  "flags": [
    {
      "claim": "exact phrase copied from the story",
      "reason": "not_in_source" | "contradicts_source" | "overstated",
      "note": "one factual line explaining the problem"
    }
  ]
}

List every claim before you judge any of them:
- Build "checked" first. Walk the story part by part in the order given — Headline, Standfirst, each Key point, Report lead, then each Report section from the first to the last — and add one entry per claim, prefixed with that part's label (e.g. "Section 2 — Brent crude near $95").
- Every sentence of the story must produce at least one entry in "checked". Reaching the last sentence of the last section is mandatory; unsupported material is most often added at the end.
- Then, and only then, write "flags" — one for each entry in "checked" that fails. Never flag a claim you did not list.

Granularity — check at the level of individual claims, not sentences:
- Every distinct number, amount, date, name, title, place, quantity, ratio, and attribution is its own claim and gets its own entry in "checked".
- One sentence usually contains several claims. "On July 22, 2026, Trump warned he would destroy one bridge for each strike on ships in the Strait of Hormuz" contains at least five: the date, the person, the stated threat, the one-for-one ratio, and the location.
- A full story yields 15 to 30 entries. A shorter list means you checked sentences instead of claims, or stopped before the end of the story — go back and list each fact.

Meaning, not wording — this is the most important rule:
- You are checking MEANING. Rewording, paraphrase, summary, synonyms, reordering, indirect speech, and different sentence structure are ALL fine and must never be flagged.
- Flag only when the meaning differs from the sources: a different fact, number, date, actor, place, sequence, or causal link.
- If the sources support the substance of a claim, it PASSES even when the story words it completely differently. A paraphrase of a quote is not a problem. Naming a person the sources name is not a problem.
- NEVER write a note like "does not specify the exact phrasing", "does not use the same wording", or "not phrased that way in the sources". If your only objection is wording, there is no flag.

Locate the support before you pass a claim:
- For every claim, find the sentence in a source that states it. If you cannot point to such a sentence, the claim is unsupported — flag it.
- A word appearing somewhere in the sources is NOT support. "France" inside a shipping company's name does not support "France condemned the strikes". "Monday" in an unrelated paragraph does not support "the talks began Monday". The supporting sentence must have the same actor doing the same thing in the same event as the claim.
- New actors are the most common fabrication. Whenever the story says a country, government, official, company, or organisation did or said something, find the sentence where a source has THAT actor doing or saying it. If there is none, flag "not_in_source" even though the name appears elsewhere in the sources.
- Never close a gap with your own knowledge. A claim that is true in the real world but absent from these sources is still "not_in_source".

Dates:
- Every specific calendar date, weekday, or relative day ("Monday", "yesterday", "three days ago") in the story is a claim you must check.
- A date passes only when a source's body text gives that date for that event. Source titles, outlet names, and publication dates are not evidence of when something happened.
- An unsupported date is "not_in_source" even when the rest of the sentence is accurate.

What to check:
- Verify only factual claims: numbers, amounts, names, titles, dates, places, events, and attributions (who said what).
- A claim PASSES if the sources state it in any wording, or if it is a direct restatement or simple arithmetic on what the sources state (e.g. "more than doubled" for a figure going from 4 to 9, or a total that sums provided figures).
- Rounded and hedged figures PASS when they are consistent with the source number: "nearly $95" for $94.07, "about 200" for 197, "more than 1,000" for 1,240. Flag a number only when it points to a different quantity than the sources give.
- A claim FAILS as "not_in_source" when its substance appears nowhere in the sources — including true background knowledge. If no source says it in any wording, flag it.
- A claim FAILS as "contradicts_source" when the sources state something materially different: a different number, name, date, actor, place, or sequence of events.
- A claim FAILS as "overstated" when the sources support a weaker version — a hedged or attributed statement presented as established fact, a threat or plan reported as something that already happened, or a magnitude larger than the sources support.

Rules:
- "claim" MUST be copied verbatim from the story text — character for character, including its numbers and names. Never paraphrase, summarize, or re-word it. It must be findable by searching the story for that exact string.
- Copy the claim from one place in the story. Never stitch together words from two different parts (a date from the standfirst with a sentence from a section) into one claim.
- Keep "claim" long enough to locate the problem but no longer than one sentence.
- "note" must state what the SOURCES actually say, so an editor can fix the claim without rereading them. Write "The sources say X" or "No source mentions X", never "the story does not specify" or a complaint about phrasing.
- "note" is one factual line. No opinion, no advice, no framing verbs (highlights, underscores, signals).
- NEVER make style, tone, structure, or wording judgments. Grammar, phrasing, headline length, and section titles are out of scope.
- Do not flag the same claim twice. If the same fact is wrong in several places, flag it once. Do not flag an attribution that the sources support.
- "checked" entries are short descriptions, not quotes; only "claim" must be verbatim.
- If every claim checks out, return an empty flags array. Never invent a flag to appear thorough.`;

export type VerificationReason =
  | "not_in_source"
  | "contradicts_source"
  | "overstated";

export type VerificationFlag = {
  claim: string;
  reason: VerificationReason;
  note: string;
};

export type VerificationResult = {
  claims_checked: number;
  flags: VerificationFlag[];
};

export type VerifySource = {
  outlet: string;
  title: string;
  text: string;
};

type StoryInput = {
  headline: string;
  summary: string;
  keyPoints: Array<{ text: string; source: string }>;
  report: { lead: string; sections: Array<{ title: string; body: string }> } | null;
};

function buildSourceBlock(sources: VerifySource[]): string {
  if (sources.length === 0) {
    return "(no source text available)";
  }
  return sources
    .map(
      (source, index) =>
        `Source ${index + 1} — Outlet: ${source.outlet}\nTitle: ${source.title}\n\n${source.text}`,
    )
    .join("\n\n---\n\n");
}

function buildStoryBlock(story: StoryInput): string {
  const parts: string[] = [
    `Headline: ${story.headline}`,
    `Standfirst: ${story.summary}`,
  ];

  if (story.keyPoints.length > 0) {
    parts.push("Key points:");
    for (const [index, point] of story.keyPoints.entries()) {
      parts.push(
        `${index + 1}. ${point.text}${point.source ? ` (attributed to ${point.source})` : " (no attribution)"}`,
      );
    }
  }

  if (story.report) {
    parts.push(`Report lead: ${story.report.lead}`);
    for (const section of story.report.sections) {
      parts.push(`Report section — ${section.title}: ${section.body}`);
    }
  }

  return parts.join("\n");
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const MONTH_DAY = new RegExp(
  `\\b(${MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`,
  "gi",
);
const DAY_MONTH = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join("|")})(?:,?\\s+(\\d{4}))?`,
  "gi",
);
const WEEKDAY = new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`, "gi");
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

/** Every spelling of a date we accept as source support. */
function dateProbes(month: string, day: string, year: string | undefined): string[] {
  const index = MONTHS.indexOf(month.toLowerCase());
  const abbr = month.slice(0, 3).toLowerCase();
  const probes = [
    `${month.toLowerCase()} ${day}`,
    `${abbr} ${day}`,
    `${day} ${month.toLowerCase()}`,
    `${day} ${abbr}`,
  ];
  if (index >= 0) {
    // Zero-padded only: a bare "7/22" collides with ratios and fractions.
    const mm = String(index + 1).padStart(2, "0");
    probes.push(`${mm}/${day.padStart(2, "0")}`);
    if (year) probes.push(`${year}-${mm}-${day.padStart(2, "0")}`);
  }
  return probes;
}

/** The sentence around a match, so the flagged claim stays verbatim story text. */
function sentenceAround(text: string, index: number): string {
  let start = 0;
  for (let i = index; i > 0; i--) {
    if (/[.!?]/.test(text[i - 1]!) && /\s/.test(text[i]!)) {
      start = i;
      break;
    }
  }
  let end = text.length;
  for (let i = index; i < text.length; i++) {
    if (/[.!?]/.test(text[i]!) && (i + 1 >= text.length || /\s/.test(text[i + 1]!))) {
      end = i + 1;
      break;
    }
  }
  return text.slice(start, end).trim();
}

function storyPassages(story: StoryInput): string[] {
  const passages = [story.headline, story.summary];
  for (const point of story.keyPoints) passages.push(point.text);
  if (story.report) {
    passages.push(story.report.lead);
    for (const section of story.report.sections) passages.push(section.body);
  }
  return passages.filter((text) => text.trim().length > 0);
}

/**
 * Deterministic check the model is unreliable at: every calendar date or
 * weekday the story states must appear in the source text in some spelling.
 */
function auditDates(
  story: StoryInput,
  sources: VerifySource[],
  existing: VerificationFlag[],
): VerificationFlag[] {
  const sourceBlob = sources
    .map((source) => `${source.title}\n${source.text}`)
    .join("\n")
    .toLowerCase();
  if (!sourceBlob.trim()) return [];

  const flags: VerificationFlag[] = [];
  const seen = new Set(
    existing.map((flag) => flag.claim.toLowerCase()),
  );
  const reported = new Set<string>();

  for (const passage of storyPassages(story)) {
    const found: Array<{ mention: string; index: number; probes: string[] }> = [];

    for (const match of passage.matchAll(MONTH_DAY)) {
      found.push({
        mention: match[0],
        index: match.index ?? 0,
        probes: dateProbes(match[1]!, match[2]!, match[3]),
      });
    }
    for (const match of passage.matchAll(DAY_MONTH)) {
      found.push({
        mention: match[0],
        index: match.index ?? 0,
        probes: dateProbes(match[2]!, match[1]!, match[3]),
      });
    }
    for (const match of passage.matchAll(WEEKDAY)) {
      const day = match[1]!.toLowerCase();
      found.push({
        mention: match[0],
        index: match.index ?? 0,
        probes: [day, day.slice(0, 3)],
      });
    }
    for (const match of passage.matchAll(ISO_DATE)) {
      found.push({
        mention: match[0],
        index: match.index ?? 0,
        probes: [match[0]!.toLowerCase()],
      });
    }

    for (const mention of found) {
      const key = mention.mention.toLowerCase();
      if (reported.has(key)) continue;
      if (mention.probes.some((probe) => sourceBlob.includes(probe))) continue;
      // The model already raised this date somewhere — don't say it twice.
      if (existing.some((flag) => flag.claim.toLowerCase().includes(key))) {
        continue;
      }

      const claim = sentenceAround(passage, mention.index) || passage.trim();
      if (seen.has(claim.toLowerCase())) continue;

      reported.add(key);
      seen.add(claim.toLowerCase());
      flags.push({
        claim,
        reason: "not_in_source",
        note: `No source gives the date "${mention.mention}" for this event.`,
      });
    }
  }

  return flags;
}

function parseVerification(raw: unknown): VerificationResult | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const obj = raw as Record<string, unknown>;

  const flagsRaw = Array.isArray(obj.flags) ? obj.flags : [];
  const flags: VerificationFlag[] = [];
  const seen = new Set<string>();

  for (const item of flagsRaw) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const claim = typeof f.claim === "string" ? f.claim.trim() : "";
    if (!claim) continue;

    const reason =
      f.reason === "not_in_source" ||
      f.reason === "contradicts_source" ||
      f.reason === "overstated"
        ? f.reason
        : null;
    if (!reason) continue;

    const key = `${reason}:${claim.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    flags.push({
      claim,
      reason,
      note: typeof f.note === "string" ? f.note.trim() : "",
    });
  }

  // The enumerated list is the real count; claims_checked is a fallback for
  // responses that skip it. Neither can be fewer than the flags raised.
  const listed = Array.isArray(obj.checked)
    ? obj.checked.filter((entry) => typeof entry === "string" && entry.trim())
        .length
    : 0;
  const reported =
    typeof obj.claims_checked === "number" ? Math.round(obj.claims_checked) : 0;
  const claimsChecked = Math.max(0, listed, reported, flags.length);

  return { claims_checked: claimsChecked, flags };
}

/**
 * Fact-check a generated story against the source text it was written from and
 * persist the result on the story row. Throws on failure; callers treat the
 * verification pass as non-fatal.
 */
export async function verifyAndPersistStory(opts: {
  openai: OpenAI;
  supabase: SupabaseClient;
  storyId: string;
  headline: string;
  summary: string;
  keyPoints: Array<{ text: string; source: string }>;
  report: { lead: string; sections: Array<{ title: string; body: string }> } | null;
  sources: VerifySource[];
}): Promise<VerificationResult> {
  const story: StoryInput = {
    headline: opts.headline,
    summary: opts.summary,
    keyPoints: opts.keyPoints,
    report: opts.report,
  };

  const userMessage = `Source articles:\n${buildSourceBlock(opts.sources)}\n\n---\n\nArc story to check:\n${buildStoryBlock(story)}`;

  const completion = await opts.openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: VERIFY_STORY_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Verification returned empty response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error("Verification returned invalid JSON");
  }

  const parsed = parseVerification(parsedJson);
  if (!parsed) {
    throw new Error("Verification JSON failed validation");
  }

  const dateFlags = auditDates(story, opts.sources, parsed.flags);
  const result: VerificationResult = {
    claims_checked: Math.max(
      parsed.claims_checked,
      parsed.flags.length + dateFlags.length,
    ),
    flags: [...parsed.flags, ...dateFlags],
  };

  const { error } = await opts.supabase
    .from("stories")
    .update({ verification: result })
    .eq("id", opts.storyId);

  if (error) {
    throw new Error(`Failed to save verification: ${error.message}`);
  }

  return result;
}
