import Link from "next/link";

import { formatRelativeTime } from "@/lib/time";
import { createAdminClient } from "@/lib/supabase/admin";

import { EditForm } from "./edit-form";

export const dynamic = "force-dynamic";

type StorylineItem = {
  date: string;
  event: string;
};

function toStoryline(value: unknown): StorylineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const entry = item as Record<string, unknown>;
      return {
        date: typeof entry.date === "string" ? entry.date : "",
        event: typeof entry.event === "string" ? entry.event : "",
      };
    });
}

export default async function StoryEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: story, error: storyError } = await supabase
      .from("stories")
      .select(
        "id,article_id,arc_headline,arc_summary,arc_storyline,clip_url,cover_image_url,is_live,is_section_hero,category",
      )
      .eq("id", id)
      .single();

    if (storyError || !story) {
      return (
        <main className="min-h-screen bg-[#0a0a0a] px-6 py-10 text-zinc-100 md:px-10">
          <div className="mx-auto max-w-4xl">
            <p className="text-lg text-zinc-200">Story not found.</p>
            <Link href="/admin" className="mt-3 inline-block text-sm text-[#c8ff00] hover:underline">
              Back to /admin
            </Link>
          </div>
        </main>
      );
    }

    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("title,summary,link,category,published_at,feeds(source_name)")
      .eq("id", story.article_id)
      .single();

    if (articleError || !article) {
      throw new Error(`Failed to load article context: ${articleError?.message ?? "unknown"}`);
    }

    const sourceName =
      (
        article.feeds as unknown as
          | { source_name?: string | null }
          | { source_name?: string | null }[]
          | null
      ) &&
      !Array.isArray(article.feeds)
        ? (article.feeds as { source_name?: string | null }).source_name
        : Array.isArray(article.feeds)
          ? (article.feeds[0] as { source_name?: string | null } | undefined)?.source_name
          : null;

    return (
      <main className="min-h-screen bg-[#0a0a0a] px-6 py-10 text-zinc-100 md:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <Link href="/admin" className="text-sm text-[#c8ff00] hover:underline">
            Back to /admin
          </Link>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-zinc-800 bg-[#0f0f0f] p-5">
              <h2 className="text-xl font-semibold text-zinc-100">Original article</h2>
              <p className="mt-3 text-lg leading-6 text-zinc-100">{article.title}</p>
              <p className="mt-2 text-sm text-zinc-400">
                {sourceName ?? "Unknown source"}
                <span className="mx-2 text-zinc-600">•</span>
                {article.category ?? "uncategorized"}
                <span className="mx-2 text-zinc-600">•</span>
                {formatRelativeTime(article.published_at) || "Unknown"}
              </p>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                {article.summary || "No summary available."}
              </p>
              <a
                href={article.link}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-sm text-[#c8ff00] hover:underline"
              >
                Open source article
              </a>
            </section>

            <section className="rounded-lg border border-zinc-800 bg-[#0f0f0f] p-5">
              <h2 className="text-xl font-semibold text-zinc-100">Arc draft</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Category: {story.category ?? "uncategorized"}
                <span className="mx-2 text-zinc-600">•</span>
                Status: {story.is_live ? "Live" : "Draft"}
              </p>
              <div className="mt-4">
                <EditForm
                  story={{
                    id: story.id,
                    arc_headline: story.arc_headline,
                    arc_summary: story.arc_summary,
                    arc_storyline: toStoryline(story.arc_storyline),
                    clip_url: story.clip_url,
                    cover_image_url: story.cover_image_url,
                    is_live: story.is_live,
                    is_section_hero: Boolean(story.is_section_hero),
                    category: typeof story.category === "string" ? story.category : "",
                  }}
                />
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <main className="min-h-screen bg-[#0a0a0a] px-6 py-10 text-zinc-100 md:px-10">
        <div className="mx-auto max-w-4xl rounded-lg border border-zinc-800 bg-[#0f0f0f] p-5">
          <p className="text-lg text-zinc-100">Failed to load story editor.</p>
          <p className="mt-2 text-sm text-zinc-400">{message}</p>
          <Link href="/admin" className="mt-4 inline-block text-sm text-[#c8ff00] hover:underline">
            Back to /admin
          </Link>
        </div>
      </main>
    );
  }
}
