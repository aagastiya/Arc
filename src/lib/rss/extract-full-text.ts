import { extract } from "@extractus/article-extractor";
import type { SupabaseClient } from "@supabase/supabase-js";

import { stripHtml } from "@/lib/rss/strip-html";

export const THIN_TEXT_THRESHOLD = 500;

/** Publishers that accept the connection and never answer must not hold up a generate. */
export const EXTRACT_TIMEOUT_MS = 10_000;

/** How long a failed source is left alone before another attempt. */
export const EXTRACT_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

/** Polite gap between live fetches inside one generate call. */
export const EXTRACT_POLITE_DELAY_MS = 800;

export type SourceQuality = "full" | "thin";

export type ExtractOutcome =
  | "cached" // reused stored full text
  | "extracted" // fetched usable full text this call
  | "too_short" // fetched, but not enough text to beat the summary
  | "timeout" // aborted at EXTRACT_TIMEOUT_MS
  | "failed" // network or parse error
  | "cooldown" // recent failure, not retried yet
  | "robots_disallow" // robots.txt forbids this path
  | "no_link";

export type ResolvedSourceText = {
  articleId: string;
  quality: SourceQuality;
  text: string;
  textLength: number;
  fromCache: boolean;
  outcome: ExtractOutcome;
  durationMs: number;
};

export type ExtractResult = {
  text: string;
  outcome: "extracted" | "timeout" | "failed" | "robots_disallow";
  durationMs: number;
};

function normalizeExtracted(raw: string | null | undefined): string {
  if (!raw) return "";
  // stripHtml defaults to a 400-char snippet for RSS; pass a high cap for full body.
  return stripHtml(raw, 200_000)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type RobotsRules = {
  disallows: string[];
  allows: string[];
};

const robotsCache = new Map<string, { rules: RobotsRules; fetchedAt: number }>();
const ROBOTS_CACHE_MS = 60 * 60 * 1000;

function pathMatchesRule(path: string, rule: string): boolean {
  if (!rule) return false;
  if (rule === "/") return true;
  return path.startsWith(rule);
}

/**
 * Minimal robots.txt check for ArcBot / * user-agents. Fail-open on fetch errors
 * so a dead robots endpoint does not block generation.
 */
export async function isUrlAllowedByRobots(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const origin = parsed.origin;
  const cached = robotsCache.get(origin);
  let rules: RobotsRules;
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_CACHE_MS) {
    rules = cached.rules;
  } else {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; ArcBot/1.0; +https://arc.news)",
          Accept: "text/plain,*/*",
        },
        signal: AbortSignal.timeout(4_000),
      });
      if (!res.ok) {
        rules = { disallows: [], allows: [] };
      } else {
        rules = parseRobotsTxt(await res.text());
      }
    } catch {
      rules = { disallows: [], allows: [] };
    }
    robotsCache.set(origin, { rules, fetchedAt: Date.now() });
  }

  const path = `${parsed.pathname}${parsed.search}`;
  const allowed = rules.allows.some((r) => pathMatchesRule(path, r));
  if (allowed) return true;
  const blocked = rules.disallows.some((r) => pathMatchesRule(path, r));
  return !blocked;
}

function parseRobotsTxt(body: string): RobotsRules {
  const lines = body.split(/\r?\n/);
  let inRelevant = false;
  const disallows: string[] = [];
  const allows: string[] = [];

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      const agent = value.toLowerCase();
      inRelevant = agent === "*" || agent.includes("arcbot");
      continue;
    }
    if (!inRelevant) continue;
    if (key === "disallow" && value) disallows.push(value);
    if (key === "allow" && value) allows.push(value);
  }

  return { disallows, allows };
}

/** Fetch + extract main article text, giving up after EXTRACT_TIMEOUT_MS. */
export async function extractArticleFullText(url: string): Promise<ExtractResult> {
  const started = Date.now();

  const allowed = await isUrlAllowedByRobots(url);
  if (!allowed) {
    return {
      text: "",
      outcome: "robots_disallow",
      durationMs: Date.now() - started,
    };
  }

  try {
    const article = await extract(url, undefined, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ArcBot/1.0; +https://arc.news)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    });
    return {
      text: normalizeExtracted(article?.content ?? article?.description ?? ""),
      outcome: "extracted",
      durationMs: Date.now() - started,
    };
  } catch (err: unknown) {
    const aborted =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      text: "",
      outcome: aborted ? "timeout" : "failed",
      durationMs: Date.now() - started,
    };
  }
}

function resolved(
  articleId: string,
  text: string,
  outcome: ExtractOutcome,
  fromCache: boolean,
  durationMs: number,
): ResolvedSourceText {
  const body = text || "(no summary available)";
  return {
    articleId,
    quality: text.length >= THIN_TEXT_THRESHOLD ? "full" : "thin",
    text: body,
    textLength: text.length,
    fromCache,
    outcome,
    durationMs,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve source body for generation: reuse stored full text when there is
 * any, otherwise fetch once (bounded by EXTRACT_TIMEOUT_MS) and fall back to
 * the RSS summary. Only a successful fetch is cached permanently; a failure is
 * recorded so the same source is retried on the next generate after the
 * cooldown rather than being written off for good.
 *
 * Pass `politeDelayMs` > 0 when this call follows another live fetch in the
 * same generate request.
 */
export async function resolveSourceText(opts: {
  supabase: SupabaseClient;
  articleId: string;
  link: string | null;
  summary: string | null;
  fullText: string | null;
  fullTextFetchedAt: string | null;
  fullTextFailedAt?: string | null;
  /** Wait this many ms before a live network fetch (not cache hits). */
  politeDelayMs?: number;
}): Promise<ResolvedSourceText> {
  const summary = (opts.summary ?? "").trim();
  const stored = (opts.fullText ?? "").trim();

  if (stored.length >= THIN_TEXT_THRESHOLD) {
    return resolved(opts.articleId, stored, "cached", true, 0);
  }

  const link = opts.link?.trim() ?? "";
  if (!link) {
    return resolved(opts.articleId, summary, "no_link", true, 0);
  }

  const failedAt = opts.fullTextFailedAt
    ? new Date(opts.fullTextFailedAt).getTime()
    : null;
  if (failedAt !== null && Date.now() - failedAt < EXTRACT_RETRY_AFTER_MS) {
    return resolved(opts.articleId, summary, "cooldown", true, 0);
  }

  if (opts.politeDelayMs && opts.politeDelayMs > 0) {
    await sleep(opts.politeDelayMs);
  }

  // One attempt per call — a retry happens on the next generate, not this one.
  const attempt = await extractArticleFullText(link);

  if (attempt.outcome === "robots_disallow") {
    return resolved(
      opts.articleId,
      summary,
      "robots_disallow",
      false,
      attempt.durationMs,
    );
  }

  if (attempt.text.length >= THIN_TEXT_THRESHOLD) {
    await opts.supabase
      .from("articles")
      .update({
        full_text: attempt.text,
        full_text_fetched_at: new Date().toISOString(),
        full_text_failed_at: null,
      })
      .eq("id", opts.articleId);

    return resolved(
      opts.articleId,
      attempt.text,
      "extracted",
      false,
      attempt.durationMs,
    );
  }

  // Other misses mark cooldown so we do not hammer.
  await opts.supabase
    .from("articles")
    .update({ full_text_failed_at: new Date().toISOString() })
    .eq("id", opts.articleId);

  const outcome: ExtractOutcome =
    attempt.outcome === "extracted" ? "too_short" : attempt.outcome;
  const best = attempt.text.length > summary.length ? attempt.text : summary;
  return resolved(opts.articleId, best, outcome, false, attempt.durationMs);
}
