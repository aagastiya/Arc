/**
 * Cap how many cluster members go into story generation.
 * Prefer one article per outlet, newest first; fill remaining slots by recency.
 */

export const GENERATE_SOURCE_CAP = 5;

export type GenerateSelectableArticle = {
  id: string;
  source_name?: string | null;
  published_at?: string | null;
};

function publishedMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function outletKey(name: string | null | undefined): string {
  const cleaned = (name ?? "").trim().toLowerCase();
  return cleaned || "__unknown__";
}

/**
 * Pick up to `cap` article ids for generation, maximizing distinct outlets.
 */
export function selectGenerateArticleIds<T extends GenerateSelectableArticle>(
  articles: T[],
  cap: number = GENERATE_SOURCE_CAP,
): string[] {
  if (articles.length === 0 || cap <= 0) return [];

  const newestFirst = [...articles].sort(
    (a, b) => publishedMs(b.published_at) - publishedMs(a.published_at),
  );

  const selected: T[] = [];
  const usedOutlets = new Set<string>();
  const usedIds = new Set<string>();

  // Pass 1: one article per outlet.
  for (const article of newestFirst) {
    if (selected.length >= cap) break;
    const outlet = outletKey(article.source_name);
    if (usedOutlets.has(outlet) && outlet !== "__unknown__") continue;
    if (usedIds.has(article.id)) continue;
    selected.push(article);
    usedIds.add(article.id);
    if (outlet !== "__unknown__") usedOutlets.add(outlet);
  }

  // Pass 2: fill with remaining newest if we still have room (same-outlet ok).
  if (selected.length < cap) {
    for (const article of newestFirst) {
      if (selected.length >= cap) break;
      if (usedIds.has(article.id)) continue;
      selected.push(article);
      usedIds.add(article.id);
    }
  }

  return selected.map((a) => a.id);
}

/** Fallback when only ids are known — keep order, hard-cap. */
export function capArticleIds(ids: string[], cap: number = GENERATE_SOURCE_CAP): string[] {
  return [...new Set(ids)].slice(0, cap);
}
