import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

export const VERIFY_STORY_PROMPT = `You are Arc's fact checker. You receive the source articles Arc wrote from, then the story Arc produced. Check the story's factual claims against those sources and return ONLY valid JSON (no markdown, no prose) in this exact shape:

{
  "claims_checked": 0,
  "flags": [
    {
      "claim": "exact phrase copied from the story",
      "reason": "not_in_source" | "contradicts_source" | "overstated",
      "note": "one factual line explaining the problem"
    }
  ]
}

Granularity — check at the level of individual claims, not sentences:
- Every distinct number, amount, date, name, title, place, quantity, ratio, and attribution is its own claim and counts separately toward claims_checked.
- One sentence usually contains several claims. "On July 22, 2026, Trump warned he would destroy one bridge for each strike on ships in the Strait of Hormuz" contains at least five: the date, the person, the stated threat, the one-for-one ratio, and the location.
- Check every claim in the headline, the standfirst, each key point, the report lead, and every report section.
- A full story typically yields 15 to 30 checked claims. Returning only a handful means you checked sentences instead of claims — go back and count each fact.

Meaning, not wording — this is the most important rule:
- You are checking MEANING. Rewording, paraphrase, summary, synonyms, reordering, indirect speech, and different sentence structure are ALL fine and must never be flagged.
- Flag only when the meaning differs from the sources: a different fact, number, date, actor, place, sequence, or causal link.
- If the sources support the substance of a claim, it PASSES even when the story words it completely differently. A paraphrase of a quote is not a problem. Naming a person the sources name is not a problem.
- NEVER write a note like "does not specify the exact phrasing", "does not use the same wording", or "not phrased that way in the sources". If your only objection is wording, there is no flag.

What to check:
- Verify only factual claims: numbers, amounts, names, titles, dates, places, events, and attributions (who said what).
- A claim PASSES if the sources state it in any wording, or if it is a direct restatement or simple arithmetic on what the sources state (e.g. "more than doubled" for a figure going from 4 to 9, or a total that sums provided figures).
- A claim FAILS as "not_in_source" when its substance appears nowhere in the sources — including true background knowledge. If no source says it in any wording, flag it.
- A claim FAILS as "contradicts_source" when the sources state something materially different: a different number, name, date, actor, place, or sequence of events.
- A claim FAILS as "overstated" when the sources support a weaker version — a hedged or attributed statement presented as established fact, a threat or plan reported as something that already happened, or a magnitude larger than the sources support.

Rules:
- "claim" MUST be copied verbatim from the story text — character for character, including its numbers and names. Never paraphrase, summarize, or re-word it. It must be findable by searching the story for that exact string.
- Keep "claim" long enough to locate the problem but no longer than one sentence.
- "note" must state what the SOURCES actually say, so an editor can fix the claim without rereading them. Write "The sources say X" or "No source mentions X", never "the story does not specify" or a complaint about phrasing.
- "note" is one factual line. No opinion, no advice, no framing verbs (highlights, underscores, signals).
- NEVER make style, tone, structure, or wording judgments. Grammar, phrasing, headline length, and section titles are out of scope.
- Do not flag the same claim twice. If the same fact is wrong in several places, flag it once. Do not flag an attribution that the sources support.
- claims_checked is the total number of factual claims you examined, including the ones that passed.
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

  const checkedRaw =
    typeof obj.claims_checked === "number" ? Math.round(obj.claims_checked) : 0;
  // A model can under-report the total; it can never be fewer than the flags raised.
  const claimsChecked = Math.max(0, checkedRaw, flags.length);

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
  const userMessage = `Source articles:\n${buildSourceBlock(opts.sources)}\n\n---\n\nArc story to check:\n${buildStoryBlock({
    headline: opts.headline,
    summary: opts.summary,
    keyPoints: opts.keyPoints,
    report: opts.report,
  })}`;

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

  const result = parseVerification(parsedJson);
  if (!result) {
    throw new Error("Verification JSON failed validation");
  }

  const { error } = await opts.supabase
    .from("stories")
    .update({ verification: result })
    .eq("id", opts.storyId);

  if (error) {
    throw new Error(`Failed to save verification: ${error.message}`);
  }

  return result;
}
