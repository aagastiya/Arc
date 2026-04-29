import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

type StorylineItem = {
  date: string;
  event: string;
};

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStoryline(value: unknown): value is StorylineItem[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const record = item as Record<string, unknown>;
    return typeof record.date === "string" && typeof record.event === "string";
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid request body. Expected JSON object." },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (hasOwn(body, "arc_headline")) {
      if (!isNonEmptyString(body.arc_headline)) {
        return NextResponse.json(
          { error: "arc_headline must be a non-empty string" },
          { status: 400 },
        );
      }
      updateData.arc_headline = body.arc_headline;
    }

    if (hasOwn(body, "arc_summary")) {
      if (!isNonEmptyString(body.arc_summary)) {
        return NextResponse.json(
          { error: "arc_summary must be a non-empty string" },
          { status: 400 },
        );
      }
      updateData.arc_summary = body.arc_summary;
    }

    if (hasOwn(body, "arc_storyline")) {
      if (!isStoryline(body.arc_storyline)) {
        return NextResponse.json(
          {
            error:
              "arc_storyline must be an array of objects with string date and event fields",
          },
          { status: 400 },
        );
      }
      updateData.arc_storyline = body.arc_storyline;
    }

    if (hasOwn(body, "clip_url")) {
      const value = body.clip_url;
      if (value !== null && typeof value !== "string") {
        return NextResponse.json(
          { error: "clip_url must be a string or null" },
          { status: 400 },
        );
      }
      updateData.clip_url = value;
    }

    if (hasOwn(body, "cover_image_url")) {
      const value = body.cover_image_url;
      if (value !== null && typeof value !== "string") {
        return NextResponse.json(
          { error: "cover_image_url must be a string or null" },
          { status: 400 },
        );
      }
      updateData.cover_image_url = value;
    }

    const supabase = createAdminClient();
    if (hasOwn(body, "is_live")) {
      const value = body.is_live;
      if (typeof value !== "boolean") {
        return NextResponse.json(
          { error: "is_live must be a boolean" },
          { status: 400 },
        );
      }

      const { data: existingStory, error: existingStoryError } = await supabase
        .from("stories")
        .select("is_live,published_at")
        .eq("id", id)
        .single();

      if (existingStoryError) {
        if (existingStoryError.code === "PGRST116") {
          return NextResponse.json({ error: "Story not found" }, { status: 404 });
        }
        return NextResponse.json(
          { error: "Failed to update story", details: existingStoryError.message },
          { status: 500 },
        );
      }

      updateData.is_live = value;
      if (value === true && existingStory.is_live === false && !existingStory.published_at) {
        updateData.published_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from("stories")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Failed to update story", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 },
    );
  }
}
