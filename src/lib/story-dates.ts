/** Source articles older than this are stale for Genre Review defaults. */
export const STALE_SOURCE_MS = 72 * 60 * 60 * 1000;

/** Drafts whose newest source is older than this get archived in the one-off pass. */
export const ARCHIVE_STALE_DRAFT_MS = 14 * 24 * 60 * 60 * 1000;

/** Article retention window for unlinked rows (cleanup cron). */
export const ARTICLE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/** Absolute calendar date for admin hygiene UI — "Aug 6". */
export function formatAdminDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function isStaleSource(
  newestSourceAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!newestSourceAt) return false;
  const t = new Date(newestSourceAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t > STALE_SOURCE_MS;
}

/** Newest published_at among linked source articles (ISO or null). */
export function newestSourcePublishedAt(
  dates: Array<string | null | undefined>,
): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const iso of dates) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}
