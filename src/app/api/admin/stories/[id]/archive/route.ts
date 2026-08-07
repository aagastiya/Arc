import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Soft-archive a draft. Archived stories leave Genre Review / scan matching /
 * edition desk lists; readers never saw drafts anyway.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing story id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row, error: loadErr } = await supabase
    .from("stories")
    .select("id,is_live,archived_at,arc_headline")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }
  if (row.is_live) {
    return NextResponse.json(
      { error: "Live stories cannot be archived from this control" },
      { status: 409 },
    );
  }
  if (row.archived_at) {
    return NextResponse.json({
      ok: true,
      id: row.id,
      archived_at: row.archived_at,
      already: true,
    });
  }

  const archivedAt = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("stories")
    .update({ archived_at: archivedAt, updated_at: archivedAt })
    .eq("id", id)
    .eq("is_live", false)
    .select("id,archived_at,arc_headline")
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: updated.id,
    archived_at: updated.archived_at,
    headline: updated.arc_headline,
  });
}
