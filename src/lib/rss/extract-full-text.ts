import { extract } from "@extractus/article-extractor";
import type { SupabaseClient } from "@supabase/supabase-js";

import { stripHtml } from "@/lib/rss/strip-html";

export const THIN_TEXT_THRESHOLD = 500;

/** Publishers that accept the connection and never answer must not hold up a generate. */
export const EXTRACT_TIMEOUT_MS = 10_000;

/** How long a failed source is left alone before another attempt. */
export const EXTRACT_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

export type SourceQuality = "full" | "thin";

export type ExtractOutcome =
  | "cached" // reused stored full text
  | "extracted" // fetched usable full text this call
  | "too_short" // fetched, but not enough text to beat the summary
  | "timeout" // aborted at EXTRACT_TIMEOUT_MS
  | "failed" // network or parse error
  | "cooldown" // recent failure, not retried yet
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
  outcome: Extract<ExtractOutcome, "extracted" | "timeout" | "failed">;
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

/** Fetch + extract main article text, giving up after EXTRACT_TIMEOUT_MS. */
export async function extractArticleFullText(url: string): Promise<ExtractResult> {
  const started = Date.now();
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

/**
 * Resolve source body for generation: reuse stored full text when there is
 * any, otherwise fetch once (bounded by EXTRACT_TIMEOUT_MS) and fall back to
 * the RSS summary. Only a successful fetch is cached permanently; a failure is
 * recorded so the same source is retried on the next generate after the
 * cooldown rather than being written off for good.
 */
export async function resolveSourceText(opts: {
  supabase: SupabaseClient;
  articleId: string;
  link: string | null;
  summary: string | null;
  fullText: string | null;
  fullTextFetchedAt: string | null;
  fullTextFailedAt?: string | null;
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

  // One attempt per call — a retry happens on the next generate, not this one.
  const attempt = await extractArticleFullText(link);

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

  await opts.supabase
    .from("articles")
    .update({ full_text_failed_at: new Date().toISOString() })
    .eq("id", opts.articleId);

  const outcome: ExtractOutcome =
    attempt.outcome === "extracted" ? "too_short" : attempt.outcome;
  const best = attempt.text.length > summary.length ? attempt.text : summary;
  return resolved(opts.articleId, best, outcome, false, attempt.durationMs);
}
