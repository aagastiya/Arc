import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_NAME = 200;
const MAX_ROLE = 200;
const MAX_DESCRIPTION = 400;

type PatchBody = {
  name?: unknown;
  role_title?: unknown;
  short_description?: unknown;
};

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

/**
 * An editor's word is the highest authority on identity, so a save here locks
 * the entity to description_source 'human' and clears any Wikidata ambiguity.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing entity id" }, { status: 400 });
    }

    let body: PatchBody;
    try {
      body = (await request.json()) as PatchBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const name = cleanText(body.name, MAX_NAME);
    const roleTitle = cleanText(body.role_title, MAX_ROLE);
    const shortDescription = cleanText(body.short_description, MAX_DESCRIPTION);

    if (name !== null && name.length === 0) {
      return NextResponse.json(
        { error: "Name cannot be empty" },
        { status: 400 },
      );
    }

    if (name === null && roleTitle === null && shortDescription === null) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 },
      );
    }

    const patch: Record<string, unknown> = {
      description_source: "human",
      identity_verified_at: new Date().toISOString(),
      identity_candidates: [],
    };
    if (name !== null) patch.name = name;
    if (roleTitle !== null) patch.role_title = roleTitle;
    if (shortDescription !== null) patch.short_description = shortDescription;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("entities")
      .update(patch)
      .eq("id", id)
      .select(
        "id,kind,name,role_title,short_description,description_source,identity_verified_at,wikidata_id",
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to update entity", details: error.message },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, entity: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 },
    );
  }
}
