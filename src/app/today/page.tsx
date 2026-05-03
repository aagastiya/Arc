// Today feed structure: category nav → category sections only. No global hero. Every story belongs to exactly one category section.

import { ArcWordmark } from "@/components/arc-wordmark";
import { CategoryNav } from "@/components/category-nav";
import { SectionHeroCard } from "@/components/section-hero-card";
import { SectionMiniCard } from "@/components/section-mini-card";
import {
  CANONICAL_CATEGORY_ORDER,
  categorySectionId,
  findSectionHero,
  normalizeStoryCategory,
  type StoryCategoryBucket,
} from "@/lib/categories";
import { getLiveStories, type LiveStory } from "@/lib/stories";

export const dynamic = "force-dynamic";

function formatTopDate(date: Date): string {
  const day = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const dayOfMonth = date.toLocaleDateString("en-US", { day: "2-digit" });
  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return `${day} ${dayOfMonth} ${month}`;
}

function groupStoriesByCategory(stories: LiveStory[]): Map<StoryCategoryBucket, LiveStory[]> {
  const map = new Map<StoryCategoryBucket, LiveStory[]>();
  for (const name of CANONICAL_CATEGORY_ORDER) {
    map.set(name, []);
  }
  map.set("Other", []);

  for (const story of stories) {
    const bucket = normalizeStoryCategory(story.category);
    map.get(bucket)!.push(story);
  }

  return map;
}

function CategoryFeedSection({
  title,
  bucket,
  stories,
}: {
  title: string;
  bucket: StoryCategoryBucket;
  stories: LiveStory[];
}) {
  const hero = findSectionHero(stories);
  const rest = hero ? stories.filter((s) => s.id !== hero.id) : [];

  return (
    <section id={categorySectionId(bucket)}>
      <header className="mb-2.5 flex items-center gap-2">
        <span
          className="h-0.5 w-6 shrink-0 rounded-full"
          style={{ backgroundColor: "#c8ff00" }}
          aria-hidden
        />
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 [font-family:var(--font-syne)]">
          {title}
        </h2>
      </header>
      {stories.length === 0 ? (
        <p className="py-8 text-center text-xs italic text-zinc-600">
          No stories in this section yet.
        </p>
      ) : hero ? (
        <>
          <SectionHeroCard story={hero} categoryLabel={title} />
          {rest.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {rest.map((story) => (
                <SectionMiniCard key={story.id} story={story} categoryLabel={title} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default async function TodayPage() {
  const stories = await getLiveStories();
  const todayDate = formatTopDate(new Date());

  /** All live stories, bucketed once — sections read from this map only (no hero/rest split). */
  const grouped = groupStoriesByCategory(stories);
  const otherStories = grouped.get("Other") ?? [];

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#1a1a1a]/95 px-6 py-5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-end justify-between">
          <h1 className="leading-none">
            <ArcWordmark size="md" />
          </h1>
          <div className="text-right">
            <p className="text-sm text-zinc-400">Good morning</p>
            <p className="text-[11px] tracking-[0.16em] text-zinc-500">{todayDate}</p>
          </div>
        </div>
      </header>

      {stories.length > 0 ? <CategoryNav /> : null}

      <section className="mx-auto w-full max-w-6xl px-6 py-6">
        {stories.length === 0 ? (
          <div className="flex min-h-[55vh] items-center justify-center">
            <p className="text-lg text-zinc-400">{"Today's stories coming soon."}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {CANONICAL_CATEGORY_ORDER.map((name) => (
              <CategoryFeedSection
                key={name}
                title={name}
                bucket={name}
                stories={grouped.get(name) ?? []}
              />
            ))}

            {otherStories.length > 0 ? (
              <CategoryFeedSection title="Other" bucket="Other" stories={otherStories} />
            ) : null}
          </div>
        )}
      </section>

      <div className="h-16" />
    </main>
  );
}
