import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type DecideBody = {
  type?: unknown;
  story_id?: unknown;
  target_id?: unknown;
  decision?: unknown;
};

export async function POST(request: Request) {
  try {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return NextResponse.json(
        { error: "Server misconfigured", details: "Missing Supabase env" },
        { status: 500 },
      );
    }

    let body: DecideBody;
    try {
      body = (await request.json()) as DecideBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const type = body.type === "entity" || body.type === "event" ? body.type : null;
    const decision =
      body.decision === "approve" || body.decision === "reject"
        ? body.decision
        : null;
    const storyId =
      typeof body.story_id === "string" ? body.story_id.trim() : "";
    const targetId =
      typeof body.target_id === "string" ? body.target_id.trim() : "";

    if (!type || !decision || !storyId || !targetId) {
      return NextResponse.json(
        {
          error:
            'Body must include type ("entity"|"event"), decision ("approve"|"reject"), story_id, and target_id',
        },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    if (type === "entity") {
      if (decision === "approve") {
        const { data, error } = await supabase
          .from("story_entities")
          .update({ approved: true })
          .eq("story_id", storyId)
          .eq("entity_id", targetId)
          .select("story_id,entity_id,approved")
          .maybeSingle();

        if (error) {
          return NextResponse.json(
            { error: "Failed to approve entity", details: error.message },
            { status: 500 },
          );
        }
        if (!data) {
          return NextResponse.json(
            { error: "Story entity link not found" },
            { status: 404 },
          );
        }
        return NextResponse.json({ ok: true, type, decision, link: data });
      }

      const { error: delErr } = await supabase
        .from("story_entities")
        .delete()
        .eq("story_id", storyId)
        .eq("entity_id", targetId);

      if (delErr) {
        return NextResponse.json(
          { error: "Failed to reject entity", details: delErr.message },
          { status: 500 },
        );
      }

      const { count, error: countErr } = await supabase
        .from("story_entities")
        .select("story_id", { count: "exact", head: true })
        .eq("entity_id", targetId);

      if (countErr) {
        return NextResponse.json(
          { error: "Failed to check entity links", details: countErr.message },
          { status: 500 },
        );
      }

      let orphanDeleted = false;
      if ((count ?? 0) === 0) {
        const { error: orphanErr } = await supabase
          .from("entities")
          .delete()
          .eq("id", targetId);
        if (orphanErr) {
          return NextResponse.json(
            { error: "Failed to delete orphan entity", details: orphanErr.message },
            { status: 500 },
          );
        }
        orphanDeleted = true;
      }

      return NextResponse.json({
        ok: true,
        type,
        decision,
        orphan_deleted: orphanDeleted,
      });
    }

    // type === "event"
    if (decision === "approve") {
      const { data, error } = await supabase
        .from("story_events")
        .update({ approved: true })
        .eq("story_id", storyId)
        .eq("event_id", targetId)
        .select("story_id,event_id,approved")
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: "Failed to approve event", details: error.message },
          { status: 500 },
        );
      }
      if (!data) {
        return NextResponse.json(
          { error: "Story event link not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, type, decision, link: data });
    }

    const { error: delErr } = await supabase
      .from("story_events")
      .delete()
      .eq("story_id", storyId)
      .eq("event_id", targetId);

    if (delErr) {
      return NextResponse.json(
        { error: "Failed to reject event", details: delErr.message },
        { status: 500 },
      );
    }

    const { count, error: countErr } = await supabase
      .from("story_events")
      .select("story_id", { count: "exact", head: true })
      .eq("event_id", targetId);

    if (countErr) {
      return NextResponse.json(
        { error: "Failed to check event links", details: countErr.message },
        { status: 500 },
      );
    }

    let orphanDeleted = false;
    if ((count ?? 0) === 0) {
      const { error: orphanErr } = await supabase
        .from("events")
        .delete()
        .eq("id", targetId);
      if (orphanErr) {
        return NextResponse.json(
          { error: "Failed to delete orphan event", details: orphanErr.message },
          { status: 500 },
        );
      }
      orphanDeleted = true;
    }

    return NextResponse.json({
      ok: true,
      type,
      decision,
      orphan_deleted: orphanDeleted,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 },
    );
  }
}
