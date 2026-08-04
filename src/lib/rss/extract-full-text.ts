import { extract } from "@extractus/article-extractor";
import type { SupabaseClient } from "@supabase/supabase-js";

import { stripHtml } from "@/lib/rss/strip-html";

export const THIN_TEXT_THRESHOLD = 500;

export type SourceQuality = "full" | "thin";

export type ResolvedSourceText = {
  articleId: string;
  quality: SourceQuality;
  text: string;
  textLength: number;
  fromCache: boolean;
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

/** Fetch + extract main article text from a URL. Returns "" on failure. */
export async function extractArticleFullText(url: string): Promise<string> {
  try {
    const article = await extract(url, undefined, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ArcBot/1.0; +https://arc.news)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    return normalizeExtracted(article?.content ?? article?.description ?? "");
  } catch {
    return "";
  }
}

/**
 * Resolve source body for generation: reuse cached full_text when present,
 * otherwise fetch+extract, cache, and fall back to summary if thin (<500 chars).
 */
export async function resolveSourceText(opts: {
  supabase: SupabaseClient;
  articleId: string;
  link: string | null;
  summary: string | null;
  fullText: string | null;
  fullTextFetchedAt: string | null;
}): Promise<ResolvedSourceText> {
  const summary = (opts.summary ?? "").trim();

  if (opts.fullText && opts.fullText.trim().length >= THIN_TEXT_THRESHOLD) {
    const text = opts.fullText.trim();
    return {
      articleId: opts.articleId,
      quality: "full",
      text,
      textLength: text.length,
      fromCache: true,
    };
  }

  // Already attempted and cached as thin/empty — don't hammer the origin
  if (opts.fullTextFetchedAt && (!opts.fullText || opts.fullText.trim().length < THIN_TEXT_THRESHOLD)) {
    const text = (opts.fullText && opts.fullText.trim()) || summary;
    return {
      articleId: opts.articleId,
      quality: text.length >= THIN_TEXT_THRESHOLD ? "full" : "thin",
      text: text || "(no summary available)",
      textLength: text.length,
      fromCache: true,
    };
  }

  let extracted = "";
  if (opts.link?.trim()) {
    extracted = await extractArticleFullText(opts.link.trim());
  }

  const fetchedAt = new Date().toISOString();
  const usable =
    extracted.length >= THIN_TEXT_THRESHOLD
      ? extracted
      : extracted || summary;

  // Cache whatever we got (including thin) so we don't re-fetch every time
  await opts.supabase
    .from("articles")
    .update({
      full_text: extracted.length > 0 ? extracted : null,
      full_text_fetched_at: fetchedAt,
    })
    .eq("id", opts.articleId);

  const text = usable || "(no summary available)";
  return {
    articleId: opts.articleId,
    quality: text.length >= THIN_TEXT_THRESHOLD ? "full" : "thin",
    text,
    textLength: text.length,
    fromCache: false,
  };
}
