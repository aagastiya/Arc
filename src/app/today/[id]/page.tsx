import Image from "next/image";
import Link from "next/link";

import { ArcWordmark } from "@/components/arc-wordmark";
import { getLiveStoryById } from "@/lib/stories";
import { formatRelativeTime } from "@/lib/time";

export const dynamic = "force-dynamic";

function formatTimelineDate(value: string): string {
  if (!value) {
    return "";
  }

  if (/^\d{4}$/.test(value) || /^\d{4}-\d{4}$/.test(value)) {
    return value;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    const date = new Date(`${value}-01T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString("en", {
      month: "short",
      year: "numeric",
    });
  }

  return value;
}

export default async function TodayStoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const story = await getLiveStoryById(id);

  if (!story) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#1a1a1a] px-6 text-zinc-100">
        <div className="text-center">
          <p className="text-lg text-zinc-200">Story not found.</p>
          <Link href="/today" className="mt-3 inline-block text-sm text-[#c8ff00] hover:underline">
            Back to /today
          </Link>
        </div>
      </main>
    );
  }

  const showTimeline = story.arc_storyline.length >= 2;
  const sourceLine = story.source_name
    ? `${story.source_name.toUpperCase()} · ${story.category.toUpperCase()}`
    : story.category.toUpperCase();

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-zinc-100">
      <header className="border-b border-zinc-800 px-5 py-4">
        <div className="mx-auto grid w-full max-w-[720px] grid-cols-3 items-center">
          <div>
            <Link href="/today" className="text-sm text-zinc-300 hover:text-zinc-100">
              ← Back
            </Link>
          </div>
          <h1 className="flex justify-center text-center leading-none">
            <ArcWordmark size="md" />
          </h1>
          <div />
        </div>
      </header>

      <article className="mx-auto w-full max-w-[720px] px-0 pb-20">
        <section className="relative mt-4 overflow-hidden border-y border-zinc-800 bg-[#0f0f0f] sm:rounded-xl sm:border">
          {story.clip_url ? (
            <video
              controls
              playsInline
              preload="metadata"
              poster={story.cover_image_url ?? undefined}
              className="aspect-video w-full bg-black object-cover"
              src={story.clip_url}
            />
          ) : story.cover_image_url ? (
            <div className="relative aspect-video w-full">
              <Image
                src={story.cover_image_url}
                alt={story.arc_headline}
                fill
                unoptimized
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 720px"
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-[#222]">
              <span className="text-xs font-semibold tracking-[0.16em] text-[#c8ff00]">
                {story.category.toUpperCase()}
              </span>
            </div>
          )}

          <div className="absolute left-3 top-3 rounded-md bg-black/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
            {story.source_name?.toUpperCase() ?? "SOURCE"}
          </div>
        </section>

        <section className="px-6 pt-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{sourceLine}</p>
          <h2 className="mt-2 text-[24px] font-bold leading-tight text-zinc-100 sm:text-[30px] [font-family:var(--font-syne)]">
            {story.arc_headline}
          </h2>
          <p className="mt-3 text-xs text-zinc-500">
            {formatRelativeTime(story.published_at) || "Unknown"}
          </p>
        </section>

        <section className="px-6 pt-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c8ff00]">
            60-second read
          </p>
          <p className="text-[15px] leading-[1.65] text-zinc-300 sm:text-base">{story.arc_summary}</p>
        </section>

        {showTimeline ? (
          <section className="px-6 pt-8">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c8ff00]">
              Storyline
            </h3>
            <div className="mt-4">
              {story.arc_storyline.map((item, index) => (
                <div
                  key={`${item.date}-${item.event}-${index}`}
                  className="relative pl-8"
                >
                  {index < story.arc_storyline.length - 1 ? (
                    <span className="absolute left-[9px] top-4 h-[calc(100%-8px)] w-px bg-zinc-700" />
                  ) : null}
                  <span className="absolute left-1 top-1.5 h-4 w-4 rounded-full border-2 border-[#1a1a1a] bg-[#c8ff00]" />
                  <p className="text-sm font-semibold text-zinc-100">
                    {formatTimelineDate(item.date)}
                  </p>
                  <p className="pb-6 pt-1 text-sm leading-6 text-zinc-300">{item.event}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="px-6 pt-2">
          <Link
            href={story.original_link}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[#c8ff00] hover:underline"
          >
            Read original at {story.source_name ?? "the source"} →
          </Link>
        </footer>
      </article>
    </main>
  );
}
