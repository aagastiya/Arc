import {
  formatAdminDate,
  isStaleSource,
} from "@/lib/story-dates";

type Props = {
  newestSourceAt: string | null;
  publishedAt: string | null;
  /** When true, Published line shows "draft" instead of a date. */
  isDraft?: boolean;
  className?: string;
};

/**
 * Two-line hygiene stamp used on every admin story surface:
 * Sources (newest linked article) + Published (story go-live or draft).
 */
export function AdminStoryDates({
  newestSourceAt,
  publishedAt,
  isDraft,
  className = "",
}: Props) {
  const stale = isStaleSource(newestSourceAt);
  const publishedLabel = isDraft
    ? "draft"
    : publishedAt
      ? formatAdminDate(publishedAt)
      : "—";

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-snug ${className}`}
    >
      <span className={stale ? "text-amber-300" : "text-zinc-500"}>
        Sources: {formatAdminDate(newestSourceAt)}
        {stale ? (
          <span className="ml-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
            Stale
          </span>
        ) : null}
      </span>
      <span className="text-zinc-600">·</span>
      <span className="text-zinc-500">Published: {publishedLabel}</span>
    </div>
  );
}
