import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const NEW_PROPOSAL_WINDOW_MS = 30 * 60 * 1000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storyId } = await context.params;
    if (!storyId?.trim()) {
      return NextResponse.json({ error: "Story id is required" }, { status: 400 });
    }

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return NextResponse.json(
        { error: "Server misconfigured", details: "Missing Supabase env" },
        { status: 500 },
      );
    }

    const supabase = createAdminClient();

    const { data: story, error: storyErr } = await supabase
      .from("stories")
      .select("id,updated_at")
      .eq("id", storyId)
      .maybeSingle();

    if (storyErr) {
      return NextResponse.json(
        { error: "Failed to load story", details: storyErr.message },
        { status: 500 },
      );
    }
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const [{ data: entityLinks, error: entErr }, { data: eventLinks, error: evErr }] =
      await Promise.all([
        supabase
          .from("story_entities")
          .select(
            "entity_id,role,approved,entities(id,kind,name,aliases,short_description)",
          )
          .eq("story_id", storyId),
        supabase
          .from("story_events")
          .select(
            "event_id,approved,events(id,title,open_question,status,created_at)",
          )
          .eq("story_id", storyId),
      ]);

    if (entErr) {
      return NextResponse.json(
        { error: "Failed to load story entities", details: entErr.message },
        { status: 500 },
      );
    }
    if (evErr) {
      return NextResponse.json(
        { error: "Failed to load story events", details: evErr.message },
        { status: 500 },
      );
    }

    const storyUpdatedAt = new Date(story.updated_at as string).getTime();

    const entities = (entityLinks ?? []).flatMap((row) => {
      const ent = Array.isArray(row.entities) ? row.entities[0] : row.entities;
      if (!ent || typeof ent !== "object") return [];
      const e = ent as {
        id: string;
        kind: string;
        name: string;
        aliases: string[] | null;
        short_description: string;
      };
      return [
        {
          entity_id: row.entity_id as string,
          role: row.role as string,
          approved: Boolean(row.approved),
          kind: e.kind,
          name: e.name,
          aliases: e.aliases ?? [],
          short_description: e.short_description ?? "",
        },
      ];
    });

    const events = (eventLinks ?? []).flatMap((row) => {
      const ev = Array.isArray(row.events) ? row.events[0] : row.events;
      if (!ev || typeof ev !== "object") return [];
      const e = ev as {
        id: string;
        title: string;
        open_question: string;
        status: string;
        created_at: string;
      };
      const createdAt = new Date(e.created_at).getTime();
      const isNewProposal =
        Number.isFinite(createdAt) &&
        Number.isFinite(storyUpdatedAt) &&
        Math.abs(createdAt - storyUpdatedAt) <= NEW_PROPOSAL_WINDOW_MS;

      return [
        {
          event_id: row.event_id as string,
          approved: Boolean(row.approved),
          title: e.title,
          open_question: e.open_question ?? "",
          status: e.status,
          created_at: e.created_at,
          is_new_proposal: isNewProposal,
        },
      ];
    });

    return NextResponse.json({ entities, events });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 },
    );
  }
}
