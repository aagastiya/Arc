import Link from "next/link";

import { ArchiveDraftButton } from "./archive-button";
import { clampImportance, IMPORTANCE_DEFAULT } from "@/lib/edition";
import { newestSourcePublishedAt } from "@/lib/story-dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminStoryDates } from "@/components/admin-story-dates";

import { EditForm } from "./edit-form";
import { AdminGraphPanel } from "./graph-panel";
import { parseVerification, VerificationPanel } from "./verification-panel";

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
        "id,article_id,arc_headline,arc_summary,arc_storyline,clip_url,cover_image_url,is_live,is_section_hero,importance,category,verification,published_at,archived_at",
      )
      .eq("id", id)
      .single();

    if (storyError || !story) {
      return (
        <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-zinc-100 md:px-10">
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

    const { data: linkedArticles, error: linkedErr } = await supabase
      .from("story_articles")
      .select("articles(published_at)")
      .eq("story_id", story.id);

    if (linkedErr) {
      throw new Error(`Failed to load story sources: ${linkedErr.message}`);
    }

    const sourceDates: Array<string | null> = [
      article.published_at as string | null,
    ];
    for (const row of linkedArticles ?? []) {
      const a = Array.isArray(row.articles) ? row.articles[0] : row.articles;
      if (a && typeof a === "object") {
        sourceDates.push(
          (a as { published_at?: string | null }).published_at ?? null,
        );
      }
    }
    const newestSourceAt = newestSourcePublishedAt(sourceDates);

    return (
      <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-zinc-100 md:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <Link href="/admin" className="text-sm text-[#c8ff00] hover:underline">
            Back to /admin
          </Link>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-zinc-800 bg-[var(--card)] p-5">
              <h2 className="text-xl font-semibold text-zinc-100">Original article</h2>
              <p className="mt-3 text-lg leading-6 text-zinc-100">{article.title}</p>
              <p className="mt-2 text-sm text-zinc-400">
                {sourceName ?? "Unknown source"}
                <span className="mx-2 text-zinc-600">•</span>
                {article.category ?? "uncategorized"}
              </p>
              <AdminStoryDates
                className="mt-2"
                newestSourceAt={newestSourceAt}
                publishedAt={(story.published_at as string | null) ?? null}
                isDraft={!story.is_live}
              />
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

            <section className="rounded-lg border border-zinc-800 bg-[var(--card)] p-5">
              <h2 className="text-xl font-semibold text-zinc-100">Arc draft</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Category: {story.category ?? "uncategorized"}
                <span className="mx-2 text-zinc-600">•</span>
                Status:{" "}
                {story.archived_at
                  ? "Archived"
                  : story.is_live
                    ? "Live"
                    : "Draft"}
              </p>
              <AdminStoryDates
                className="mt-2"
                newestSourceAt={newestSourceAt}
                publishedAt={(story.published_at as string | null) ?? null}
                isDraft={!story.is_live}
              />
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
                    importance: clampImportance(
                      typeof story.importance === "number"
                        ? story.importance
                        : IMPORTANCE_DEFAULT,
                    ),
                    category: typeof story.category === "string" ? story.category : "",
                  }}
                />
              </div>
              {!story.is_live && !story.archived_at ? (
                <ArchiveDraftButton storyId={story.id} />
              ) : null}
            </section>
          </div>

          <VerificationPanel verification={parseVerification(story.verification)} />

          <AdminGraphPanel storyId={story.id} />
        </div>
      </main>
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-zinc-100 md:px-10">
        <div className="mx-auto max-w-4xl rounded-lg border border-zinc-800 bg-[var(--card)] p-5">
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
