import Image from "next/image";
import Link from "next/link";

import { ArcWordmark } from "@/components/arc-wordmark";
import { getLiveStories, type LiveStory } from "@/lib/stories";
import { formatRelativeTime } from "@/lib/time";

export const dynamic = "force-dynamic";

function formatTopDate(date: Date): string {
  const day = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const dayOfMonth = date.toLocaleDateString("en-US", { day: "2-digit" });
  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return `${day} ${dayOfMonth} ${month}`;
}

function metaLine(story: LiveStory): string {
  const category = story.category.toUpperCase();
  return story.source_name ? `${story.source_name.toUpperCase()} · ${category}` : category;
}

function Cover({
  story,
  compact,
}: {
  story: LiveStory;
  compact?: boolean;
}) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-[#1a1a1a]">
      {story.cover_image_url ? (
        <Image
          src={story.cover_image_url}
          alt={story.arc_headline}
          fill
          unoptimized
          className="object-cover"
          sizes={compact ? "(max-width: 640px) 100vw, 50vw" : "100vw"}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-[#222]">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#c8ff00]">
            {story.category.toUpperCase()}
          </span>
        </div>
      )}

      {story.clip_url ? (
        <div className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#c8ff00]">
          <span className="ml-[2px] inline-block h-0 w-0 border-y-[6px] border-y-transparent border-l-[10px] border-l-white" />
        </div>
      ) : null}
    </div>
  );
}

function HeroCard({ story }: { story: LiveStory }) {
  return (
    <Link
      href={`/today/${story.id}`}
      className="block overflow-hidden rounded-xl border border-zinc-800 bg-[#0f0f0f] transition hover:border-zinc-600"
    >
      <Cover story={story} />
      <div className="space-y-3 p-4">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{metaLine(story)}</p>
        <h2 className="line-clamp-3 text-2xl font-bold leading-tight text-zinc-100 [font-family:var(--font-syne)]">
          {story.arc_headline}
        </h2>
        <p className="text-sm leading-6 text-zinc-400">{story.arc_summary}</p>
        <p className="text-xs text-zinc-500">{formatRelativeTime(story.published_at) || "Unknown"}</p>
      </div>
    </Link>
  );
}

function StoryCard({ story }: { story: LiveStory }) {
  return (
    <Link
      href={`/today/${story.id}`}
      className="block overflow-hidden rounded-xl border border-zinc-800 bg-[#0f0f0f] transition hover:border-zinc-600"
    >
      <Cover story={story} compact />
      <div className="space-y-2 p-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{metaLine(story)}</p>
        <h3 className="line-clamp-3 text-base font-bold leading-snug text-zinc-100 [font-family:var(--font-syne)]">
          {story.arc_headline}
        </h3>
        <p className="text-[10px] text-zinc-500">{formatRelativeTime(story.published_at) || "Unknown"}</p>
      </div>
    </Link>
  );
}

export default async function TodayPage() {
  const stories = await getLiveStories();
  const [hero, ...rest] = stories;
  const todayDate = formatTopDate(new Date());

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

      <section className="mx-auto w-full max-w-6xl px-6 py-6">
        {stories.length === 0 ? (
          <div className="flex min-h-[55vh] items-center justify-center">
            <p className="text-lg text-zinc-400">Today's stories coming soon.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <HeroCard story={hero} />
            {rest.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {rest.map((story) => (
                  <StoryCard key={story.id} story={story} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <div className="h-16" />
    </main>
  );
}
