// Composing desk: today's edition exactly as the Today page will order it,
// plus the stories that dropped off overnight and can be pulled back in.

import Link from "next/link";

import {
  CarryOverRow,
  EditionRow,
  type EditionRowStory,
} from "@/components/admin-edition-rows";
import { AdminNav } from "@/components/admin-nav";
import {
  CANONICAL_CATEGORY_ORDER,
  normalizeStoryCategory,
  reviewCategorySlug,
  type StoryCategoryBucket,
} from "@/lib/categories";
import {
  clampImportance,
  editionDayFilter,
  editionDayStart,
  isInEditionDay,
  previousEditionDayStart,
} from "@/lib/edition";
import { newestSourcePublishedAt } from "@/lib/story-dates";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const EDITION_SELECT =
  "id,arc_headline,category,importance,is_section_hero,published_at,created_at,carried_over_at";

type EditionStoryRow = {
  id: string;
  arc_headline: string;
  category: string;
  importance: number | null;
  is_section_hero: boolean;
  published_at: string | null;
  created_at: string;
  carried_over_at: string | null;
};

const BUCKETS: StoryCategoryBucket[] = [...CANONICAL_CATEGORY_ORDER, "Other"];

function toRowStory(
  row: EditionStoryRow,
  newestSourceAt: string | null,
): EditionRowStory {
  return {
    id: row.id,
    headline: row.arc_headline,
    importance: clampImportance(row.importance ?? 3),
    is_section_hero: Boolean(row.is_section_hero),
    carried_over: row.carried_over_at !== null,
    published_at: row.published_at,
    newest_source_at: newestSourceAt,
  };
}

function groupByBucket(
  rows: EditionStoryRow[],
): Map<StoryCategoryBucket, EditionStoryRow[]> {
  const map = new Map<StoryCategoryBucket, EditionStoryRow[]>();
  for (const bucket of BUCKETS) {
    map.set(bucket, []);
  }
  for (const row of rows) {
    map.get(normalizeStoryCategory(row.category))!.push(row);
  }
  return map;
}

/** Heroes lead their section on the Today page, so they lead here too. */
function inReaderOrder(rows: EditionStoryRow[]): EditionStoryRow[] {
  const heroes = rows.filter((row) => row.is_section_hero);
  const rest = rows.filter((row) => !row.is_section_hero);
  return [...heroes, ...rest];
}

function Warning({ text, tone }: { text: string; tone: "amber" | "zinc" }) {
  const classes =
    tone === "amber"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
      : "border-zinc-700 text-zinc-500";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${classes}`}
    >
      {text}
    </span>
  );
}

async function loadNewestSources(
  storyIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (storyIds.length === 0) return map;

  const supabase = createAdminClient();
  const datesByStory = new Map<string, Array<string | null>>();

  for (let i = 0; i < storyIds.length; i += 40) {
    const ids = storyIds.slice(i, i + 40);
    const { data, error } = await supabase
      .from("story_articles")
      .select("story_id,articles(published_at)")
      .in("story_id", ids);
    if (error) throw new Error(`Failed to load sources: ${error.message}`);

    for (const row of data ?? []) {
      const storyId = row.story_id as string;
      const article = Array.isArray(row.articles) ? row.articles[0] : row.articles;
      const published =
        article && typeof article === "object"
          ? ((article as { published_at?: string | null }).published_at ?? null)
          : null;
      const list = datesByStory.get(storyId) ?? [];
      list.push(published);
      datesByStory.set(storyId, list);
    }
  }

  for (const id of storyIds) {
    map.set(id, newestSourcePublishedAt(datesByStory.get(id) ?? []));
  }
  return map;
}

function CategoryBlock({
  label,
  rows,
  newestByStory,
}: {
  label: StoryCategoryBucket;
  rows: EditionStoryRow[];
  newestByStory: Map<string, string | null>;
}) {
  const ordered = inReaderOrder(rows);
  const heroCount = rows.filter((row) => row.is_section_hero).length;

  return (
    <section>
      <header className="mb-1 flex flex-wrap items-center gap-2">
        <span
          className="h-0.5 w-6 shrink-0 rounded-full"
          style={{ backgroundColor: "#c8ff00" }}
          aria-hidden
        />
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-300">
          {label}
        </h2>
        <span className="text-[11px] text-zinc-600">{rows.length}</span>

        {rows.length === 0 ? <Warning text="No stories" tone="amber" /> : null}
        {rows.length > 0 && heroCount === 0 ? (
          <Warning text="No hero" tone="amber" />
        ) : null}
        {heroCount >= 2 ? <Warning text="2+ heroes" tone="amber" /> : null}

        {label !== "Other" ? (
          <Link
            href={`/admin?genre=${reviewCategorySlug(label)}`}
            className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-[#c8ff00]"
          >
            Review drafts →
          </Link>
        ) : null}
      </header>

      {ordered.length === 0 ? (
        <p className="py-2 text-xs italic text-zinc-600">
          Nothing in this section today.
        </p>
      ) : (
        <ul>
          {ordered.map((row) => (
            <EditionRow
              key={row.id}
              story={toRowStory(row, newestByStory.get(row.id) ?? null)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminEditionPage() {
  const supabase = createAdminClient();
  const dayStart = editionDayStart();
  const previousStart = previousEditionDayStart();

  // Same filter and order the reader gets, so this page cannot drift from it.
  const { data: todayData, error: todayError } = await supabase
    .from("stories")
    .select(EDITION_SELECT)
    .eq("is_live", true)
    .is("archived_at", null)
    .or(editionDayFilter(dayStart))
    .order("importance", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (todayError) {
    throw new Error(`Failed to load today's edition: ${todayError.message}`);
  }

  const { data: previousData, error: previousError } = await supabase
    .from("stories")
    .select(EDITION_SELECT)
    .eq("is_live", true)
    .is("archived_at", null)
    .or(editionDayFilter(previousStart))
    .order("created_at", { ascending: false });

  if (previousError) {
    throw new Error(`Failed to load yesterday's stories: ${previousError.message}`);
  }

  const todayRows = (todayData ?? []) as EditionStoryRow[];
  const yesterdayRows = ((previousData ?? []) as EditionStoryRow[]).filter(
    (row) => !isInEditionDay(row, dayStart),
  );

  const newestByStory = await loadNewestSources([
    ...todayRows.map((r) => r.id),
    ...yesterdayRows.map((r) => r.id),
  ]);

  const grouped = groupByBucket(todayRows);
  const visibleBuckets = BUCKETS.filter(
    (bucket) => bucket !== "Other" || (grouped.get(bucket) ?? []).length > 0,
  );

  const counts = visibleBuckets
    .map((bucket) => `${bucket} ${(grouped.get(bucket) ?? []).length}`)
    .join(" · ");

  const editionDate = dayStart.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#c8ff00]">
              {"Today's Edition"}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {editionDate} · {todayRows.length}{" "}
              {todayRows.length === 1 ? "story" : "stories"} live
            </p>
          </div>
          <AdminNav current="/admin/edition" />
        </div>

        <p className="mt-4 text-xs text-zinc-500">{counts}</p>

        <p className="mt-1 text-xs text-zinc-600">
          Rows appear in reader order: section hero first, then importance, newest
          breaking ties.{" "}
          <Link href="/today" className="text-[#c8ff00] hover:underline">
            View /today
          </Link>
        </p>

        <div className="mt-8 space-y-7">
          {visibleBuckets.map((bucket) => (
            <CategoryBlock
              key={bucket}
              label={bucket}
              rows={grouped.get(bucket) ?? []}
              newestByStory={newestByStory}
            />
          ))}
        </div>

        <details className="mt-12 border-t border-zinc-900 pt-5">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:text-zinc-200">
            {"Yesterday's stories"} ({yesterdayRows.length})
          </summary>

          {yesterdayRows.length === 0 ? (
            <p className="mt-3 text-xs italic text-zinc-600">
              Nothing from yesterday is off today&apos;s page.
            </p>
          ) : (
            <>
              <p className="mt-3 text-xs text-zinc-500">
                Published yesterday and no longer on the Today page. Keeping one
                puts it back in today&apos;s edition.
              </p>
              <ul className="mt-2">
                {yesterdayRows.map((row) => (
                  <CarryOverRow
                    key={row.id}
                    story={{
                      id: row.id,
                      headline: row.arc_headline,
                      published_at: row.published_at,
                      newest_source_at: newestByStory.get(row.id) ?? null,
                    }}
                    categoryLabel={normalizeStoryCategory(row.category)}
                  />
                ))}
              </ul>
            </>
          )}
        </details>
      </div>
    </main>
  );
}
