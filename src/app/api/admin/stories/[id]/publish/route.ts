import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  live?: unknown;
};

/**
 * Individual editor override on /admin/[id] only.
 * Unlike batch Genre Review publish, this allows flagged verification —
 * the UI confirms flags; the server still always approves graph links
 * before going live (same order as batch).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing story id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.live !== "boolean") {
    return NextResponse.json(
      { error: "live must be a boolean" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: story, error: loadErr } = await supabase
    .from("stories")
    .select("id,arc_headline,arc_summary,is_live,published_at,archived_at")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (body.live === false) {
    if (!story.is_live) {
      return NextResponse.json({
        ok: true,
        id: story.id,
        is_live: false,
        already: true,
      });
    }

    const { error: updErr } = await supabase
      .from("stories")
      .update({ is_live: false, updated_at: now })
      .eq("id", id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      id: story.id,
      is_live: false,
      headline: story.arc_headline,
    });
  }

  // —— Publish ——
  if (story.is_live) {
    return NextResponse.json({
      ok: true,
      id: story.id,
      is_live: true,
      already: true,
    });
  }

  const headline = String(story.arc_headline ?? "").trim();
  const summary = String(story.arc_summary ?? "").trim();
  if (!headline || !summary) {
    return NextResponse.json(
      { error: "Cannot publish without a headline and standfirst" },
      { status: 400 },
    );
  }

  // Approve graph first. Approved links on a draft are harmless; a live story
  // with unapproved links is not.
  const [{ error: entErr }, { error: evErr }] = await Promise.all([
    supabase
      .from("story_entities")
      .update({ approved: true })
      .eq("story_id", id)
      .eq("approved", false),
    supabase
      .from("story_events")
      .update({ approved: true })
      .eq("story_id", id)
      .eq("approved", false),
  ]);

  if (entErr || evErr) {
    return NextResponse.json(
      {
        error: `Graph approval failed: ${entErr?.message ?? evErr?.message}`,
      },
      { status: 500 },
    );
  }

  const patch: Record<string, unknown> = {
    is_live: true,
    updated_at: now,
    archived_at: null,
  };
  if (!story.published_at) {
    patch.published_at = now;
  }

  const { error: updErr } = await supabase
    .from("stories")
    .update(patch)
    .eq("id", id)
    .eq("is_live", false);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: story.id,
    is_live: true,
    published_at: story.published_at ?? now,
    headline: story.arc_headline,
  });
}
