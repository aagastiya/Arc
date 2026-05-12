import Link from "next/link";

import { ClipPlayer } from "@/components/clip-player";
import { InlineStoryline } from "@/components/inline-storyline";
import {
  CANONICAL_CATEGORY_ORDER,
  normalizeStoryCategory,
  type CanonicalCategory,
} from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";
import { getLiveStoryById } from "@/lib/stories";

export const dynamic = "force-dynamic";

function slugifyHeadline(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72);
  return slug || "storyline";
}

function buildStorylineSlug(headline: string, category: string): string {
  const h = headline.toLowerCase();
  const c = category.toLowerCase();

  if (
    h.includes("iran") ||
    h.includes("israel") ||
    h.includes("gaza") ||
    h.includes("tehran")
  ) {
    return "iran-us-israel-tensions";
  }
  if (
    h.includes("ipl") ||
    h.includes("cricket") ||
    h.includes("bcci") ||
    h.includes("t20")
  ) {
    return "ipl-2026";
  }
  if (
    h.includes("openai") ||
    h.includes("chatgpt") ||
    h.includes("google ai") ||
    h.includes("gemini") ||
    h.includes("anthropic")
  ) {
    return "openai-google-ai-race";
  }

  if (c === "sports") {
    return "sports-season-watch";
  }
  if (c === "tech") {
    return "global-ai-platform-shift";
  }
  if (c === "finance") {
    return "global-market-volatility-watch";
  }

  return slugifyHeadline(headline);
}

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
  const [story, supabase] = await Promise.all([getLiveStoryById(id), createClient()]);

  const { data: liveSwipeRows } = await supabase
    .from("stories")
    .select("id, category, published_at")
    .eq("is_live", true)
    .order("published_at", { ascending: false, nullsFirst: false });

  type SwipeRow = { id: string; category: string; published_at: string | null };
  const rows = (liveSwipeRows ?? []) as SwipeRow[];

  const byBucket: Record<CanonicalCategory, SwipeRow[]> = {
    World: [],
    India: [],
    Finance: [],
    Tech: [],
    Sports: [],
    Local: [],
  };

  for (const row of rows) {
    const bucket = normalizeStoryCategory(row.category);
    if (bucket === "Other") {
      continue;
    }
    byBucket[bucket].push(row);
  }

  const orderedStoryIds: string[] = [];
  for (const name of CANONICAL_CATEGORY_ORDER) {
    for (const r of byBucket[name]) {
      orderedStoryIds.push(r.id);
    }
  }

  const currentIndex = orderedStoryIds.indexOf(id);
  const prevStoryId = currentIndex > 0 ? orderedStoryIds[currentIndex - 1]! : null;
  const nextStoryId =
    currentIndex >= 0 && currentIndex < orderedStoryIds.length - 1
      ? orderedStoryIds[currentIndex + 1]!
      : null;

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
  const storylineSlug = buildStorylineSlug(story.arc_headline, story.category);

  return (
    <main className="relative flex min-h-screen w-full flex-col bg-[#0a0a0a] text-zinc-100">
      <div
        className="absolute left-0 right-0 z-20 flex w-full items-center gap-2"
        style={{ top: "12px", padding: "14px 16px" }}
      >
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
        prevStoryId={prevStoryId}
        nextStoryId={nextStoryId}
      />

      <div className="bg-[#0a0a0a] px-4 pb-3 pt-2">
        <InlineStoryline slug={storylineSlug} timelineItems={story.arc_storyline} />
      </div>

      <footer
        className="w-full text-[10px] text-zinc-500"
        style={{
          borderTop: "0.5px solid rgba(255,255,255,0.05)",
          padding: "12px 16px 24px",
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
