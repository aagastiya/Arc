import Link from "next/link";

import { ClipPlayer } from "@/components/clip-player";
import { StorylineToggle } from "@/components/storyline-toggle";
import { normalizeStoryCategory } from "@/lib/categories";
import { getLiveStoryById } from "@/lib/stories";

export const dynamic = "force-dynamic";

function formatPublishedDate(iso: string | null): string {
  if (!iso) {
    return "Unknown date";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "Unknown date";
  }
  return d.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-6 text-zinc-100">
        <div className="text-center">
          <p className="text-lg text-zinc-200">Story not found.</p>
          <Link href="/today" className="mt-3 inline-block text-sm text-[#c8ff00] hover:underline">
            Back to /today
          </Link>
        </div>
      </main>
    );
  }

  const canonicalCategory = normalizeStoryCategory(story.category);
  const categoryPill = canonicalCategory.toUpperCase();

  return (
    <main className="relative min-h-screen w-full bg-[#0a0a0a] text-zinc-100">
      <div
        className="absolute left-0 right-0 z-20 flex w-full items-center gap-2"
        style={{ top: "12px", padding: "14px 16px" }}
      >
        <Link
          href="/today"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-base leading-none text-white"
          style={{ background: "rgba(0,0,0,0.5)" }}
          aria-label="Close and return to feed"
        >
          ×
        </Link>
        <span
          className="shrink-0 font-bold uppercase text-[#1a1a1a]"
          style={{
            background: "#c8ff00",
            fontSize: "10px",
            letterSpacing: "1px",
            padding: "4px 10px",
            borderRadius: "4px",
          }}
        >
          {categoryPill}
        </span>
        {story.clip_url ? (
          <span
            className="ml-auto shrink-0 font-semibold text-white"
            style={{
              background: "rgba(0,0,0,0.5)",
              fontSize: "9px",
              padding: "3px 7px",
              borderRadius: "4px",
            }}
          >
            1:02
          </span>
        ) : null}
      </div>

      <ClipPlayer
        clipUrl={story.clip_url}
        coverUrl={story.cover_image_url}
        headline={story.arc_headline}
        summaryPreview={story.arc_summary}
      />

      <div style={{ background: "#0a0a0a", padding: "16px 18px" }}>
        <StorylineToggle items={story.arc_storyline} />
      </div>

      <footer
        className="w-full text-[10px] text-zinc-500"
        style={{
          borderTop: "0.5px solid rgba(255,255,255,0.05)",
          padding: "16px 18px 32px",
        }}
      >
        <p className="leading-relaxed">
          Source: {story.source_name ?? "Unknown"}{" "}
          <span className="text-zinc-600">·</span>{" "}
          <Link
            href={story.original_link}
            target="_blank"
            rel="noreferrer"
            className="break-all text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-300"
          >
            {story.original_link}
          </Link>{" "}
          <span className="text-zinc-600">·</span> {formatPublishedDate(story.published_at)}
        </p>
      </footer>
    </main>
  );
}
