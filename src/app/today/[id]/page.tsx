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

  // ── unified slide rail: all live stories in canonical category order ───────
  type LiveStoryRow = {
    id: string;
    clip_url: string | null;
    cover_image_url: string | null;
    arc_headline: string;
    arc_summary: string;
    published_at: string | null;
    category: string;
  };

  const { data: allLiveStories } = await supabase
    .from("stories")
    .select("id, clip_url, cover_image_url, arc_headline, arc_summary, published_at, category")
    .eq("is_live", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(50);

  const rows = (allLiveStories ?? []) as LiveStoryRow[];

  const byBucket: Record<CanonicalCategory, LiveStoryRow[]> = {
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

  const allStories: {
    id: string;
    clipUrl: string | null;
    coverUrl: string | null;
    headline: string;
    summaryPreview: string;
    category: string | null;
  }[] = [];

  for (const name of CANONICAL_CATEGORY_ORDER) {
    for (const r of byBucket[name]) {
      allStories.push({
        id: r.id,
        clipUrl: r.clip_url,
        coverUrl: r.cover_image_url,
        headline: r.arc_headline,
        summaryPreview: r.arc_summary,
        category: name,
      });
    }
  }

  const orderedStoryIds = allStories.map((s) => s.id);
  const globalIndex = Math.max(0, orderedStoryIds.indexOf(id));

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

  const storylineSlug = buildStorylineSlug(story.arc_headline, story.category);

  return (
    <main className="relative flex min-h-screen w-full flex-col bg-[#0a0a0a] text-zinc-100">
      {story.clip_url ? (
        <div
          className="absolute left-0 right-0 top-[calc(env(safe-area-inset-top)+12px)] z-20 flex w-full items-center justify-end gap-2"
          style={{ padding: "14px 16px" }}
        >
          <span
            className="shrink-0 font-semibold text-white"
            style={{
              background: "rgba(0,0,0,0.5)",
              fontSize: "9px",
              padding: "3px 7px",
              borderRadius: "4px",
            }}
          >
            1:02
          </span>
        </div>
      ) : null}

      <ClipPlayer allStories={allStories} currentIndex={globalIndex} />

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
