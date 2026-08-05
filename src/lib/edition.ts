/**
 * The edition day: the window the Today page treats as "today".
 *
 * A story belongs to today's edition when it was published today or an editor
 * carried it over today. Boundaries are UTC midnight, so the paper turns over
 * at one predictable moment everywhere rather than per reader clock.
 */

export const IMPORTANCE_MIN = 1;
export const IMPORTANCE_MAX = 5;
export const IMPORTANCE_DEFAULT = 3;

export function clampImportance(value: number): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) return IMPORTANCE_DEFAULT;
  return Math.min(IMPORTANCE_MAX, Math.max(IMPORTANCE_MIN, rounded));
}

/** Start of the edition day containing `now`. */
export function editionDayStart(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Start of the edition day before the one containing `now`. */
export function previousEditionDayStart(now: Date = new Date()): Date {
  const today = editionDayStart(now);
  return new Date(today.getTime() - 24 * 60 * 60 * 1000);
}

/** PostgREST `or` filter: published today, or carried over today. */
export function editionDayFilter(dayStart: Date): string {
  const iso = dayStart.toISOString();
  return `published_at.gte.${iso},carried_over_at.gte.${iso}`;
}

/** True when either timestamp falls on or after the given day boundary. */
export function isInEditionDay(
  story: { published_at: string | null; carried_over_at: string | null },
  dayStart: Date,
): boolean {
  const start = dayStart.getTime();
  const published = story.published_at
    ? new Date(story.published_at).getTime()
    : null;
  const carried = story.carried_over_at
    ? new Date(story.carried_over_at).getTime()
    : null;
  return (published !== null && published >= start) || (carried !== null && carried >= start);
}
