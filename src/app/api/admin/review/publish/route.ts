import { NextResponse } from "next/server";

import { parseVerification } from "@/app/admin/[id]/verification-panel";
import {
  canonicalCategoryToDbValue,
  isAllowedStoryCategoryDbValue,
  normalizeStoryCategory,
  parseReviewCategorySlug,
} from "@/lib/categories";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type PublishBody = {
  category?: unknown;
  story_ids?: unknown;
};

type StoryResult =
  | { id: string; ok: true; headline: string }
  | { id: string; ok: false; headline: string; error: string };

/**
 * Batch-publish a Genre Review selection. Flagged stories are refused even if
 * the client somehow sends them — the hard block is enforced here, not only in UI.
 */
export async function POST(request: Request) {
  try {
    let body: PublishBody;
    try {
      body = (await request.json()) as PublishBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const categorySlug =
      typeof body.category === "string" ? body.category.trim().toLowerCase() : "";
    const bucket = parseReviewCategorySlug(categorySlug);
    if (!bucket) {
      return NextResponse.json(
        { error: "category must be a known review slug" },
        { status: 400 },
      );
    }

    const storyIds = Array.isArray(body.story_ids)
      ? body.story_ids.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : [];

    if (storyIds.length === 0) {
      return NextResponse.json(
        { error: "story_ids must be a non-empty array" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const results: StoryResult[] = [];

    for (const storyId of storyIds) {
      const { data: story, error: loadErr } = await supabase
        .from("stories")
        .select("id,arc_headline,category,is_live,published_at,verification")
        .eq("id", storyId)
        .maybeSingle();

      if (loadErr) {
        results.push({
          id: storyId,
          ok: false,
          headline: "",
          error: loadErr.message,
        });
        continue;
      }
      if (!story) {
        results.push({
          id: storyId,
          ok: false,
          headline: "",
          error: "Story not found",
        });
        continue;
      }

      const headline = (story.arc_headline as string) || "";

      if (normalizeStoryCategory(String(story.category ?? "")) !== bucket) {
        results.push({
          id: storyId,
          ok: false,
          headline,
          error: "Story is not in this section",
        });
        continue;
      }

      if (story.is_live) {
        results.push({
          id: storyId,
          ok: false,
          headline,
          error: "Already live",
        });
        continue;
      }

      const verification = parseVerification(story.verification);
      if (verification && verification.flags.length > 0) {
        results.push({
          id: storyId,
          ok: false,
          headline,
          error: `${verification.flags.length} verification flag${verification.flags.length === 1 ? "" : "s"} — cannot publish`,
        });
        continue;
      }

      const patch: Record<string, unknown> = {
        is_live: true,
        updated_at: now,
      };
      if (!story.published_at) {
        patch.published_at = now;
      }

      // Keep category on a known DB value if it was an alias (politics → world).
      const dbCategory = String(story.category ?? "").toLowerCase();
      if (!isAllowedStoryCategoryDbValue(dbCategory) && bucket !== "Other") {
        patch.category = canonicalCategoryToDbValue(bucket);
      }

      const { error: updErr } = await supabase
        .from("stories")
        .update(patch)
        .eq("id", storyId)
        .eq("is_live", false);

      if (updErr) {
        results.push({
          id: storyId,
          ok: false,
          headline,
          error: updErr.message,
        });
        continue;
      }

      const [{ error: entErr }, { error: evErr }] = await Promise.all([
        supabase
          .from("story_entities")
          .update({ approved: true })
          .eq("story_id", storyId)
          .eq("approved", false),
        supabase
          .from("story_events")
          .update({ approved: true })
          .eq("story_id", storyId)
          .eq("approved", false),
      ]);

      if (entErr || evErr) {
        results.push({
          id: storyId,
          ok: false,
          headline,
          error: `Published, but graph approval failed: ${entErr?.message ?? evErr?.message}`,
        });
        continue;
      }

      results.push({ id: storyId, ok: true, headline });
    }

    const published = results.filter((r) => r.ok).length;
    const failed = results.length - published;

    return NextResponse.json({
      ok: failed === 0,
      published,
      failed,
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 },
    );
  }
}
