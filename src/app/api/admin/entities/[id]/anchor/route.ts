import { NextResponse } from "next/server";

import {
  isRoleTitleFromDescription,
  lookupEntity,
  type EntityKind,
} from "@/lib/graph/wikidata";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function lower(s: string): string {
  return s.trim().toLowerCase();
}

function mergeAliases(
  existing: string[] | null | undefined,
  name: string,
  extra: string | null | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [...(existing ?? []), extra ?? ""]) {
    const t = value.trim();
    if (!t) continue;
    if (lower(t) === lower(name)) continue;
    if (seen.has(lower(t))) continue;
    seen.add(lower(t));
    out.push(t);
  }
  return out;
}

/**
 * Re-run Wikidata lookup for one unanchored entity. Never renames — the
 * Wikidata label becomes an alias when it differs from Arc's newspaper name.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing entity id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: row, error: loadErr } = await supabase
      .from("entities")
      .select(
        "id,kind,name,aliases,short_description,role_title,description_source,wikidata_id,identity_candidates",
      )
      .eq("id", id)
      .maybeSingle();

    if (loadErr) {
      return NextResponse.json(
        { error: "Failed to load entity", details: loadErr.message },
        { status: 500 },
      );
    }
    if (!row) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    if (row.description_source === "human") {
      return NextResponse.json(
        {
          error: "Human-verified entities are not re-checked automatically",
        },
        { status: 409 },
      );
    }

    const kind: EntityKind = row.kind === "person" ? "person" : "organization";
    const result = await lookupEntity(row.name as string, kind);

    if (result.status === "found") {
      const patch = {
        wikidata_id: result.id,
        short_description:
          result.description || (row.short_description as string) || "",
        role_title: result.roleTitle,
        aliases: mergeAliases(
          row.aliases as string[] | null,
          row.name as string,
          result.label,
        ),
        description_source: "wikidata",
        identity_verified_at: new Date().toISOString(),
        identity_candidates: [],
      };

      const { data, error } = await supabase
        .from("entities")
        .update(patch)
        .eq("id", id)
        .select(
          "id,kind,name,aliases,role_title,short_description,description_source,identity_verified_at,wikidata_id,identity_candidates",
        )
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: "Failed to update entity", details: error.message },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        status: "found",
        entity: data,
        wikidata_label: result.label,
      });
    }

    if (result.status === "ambiguous") {
      const clearRole = isRoleTitleFromDescription(
        row.role_title as string | null,
        row.short_description as string | null,
      )
        ? { role_title: "" }
        : {};

      const { data, error } = await supabase
        .from("entities")
        .update({
          ...clearRole,
          identity_candidates: result.candidates,
        })
        .eq("id", id)
        .select(
          "id,kind,name,aliases,role_title,short_description,description_source,identity_verified_at,wikidata_id,identity_candidates",
        )
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: "Failed to flag entity", details: error.message },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        status: "ambiguous",
        entity: data,
        candidates: result.candidates,
      });
    }

    if (result.status === "not_found") {
      const clearRole = isRoleTitleFromDescription(
        row.role_title as string | null,
        row.short_description as string | null,
      )
        ? { role_title: "" }
        : {};

      if (Object.keys(clearRole).length > 0) {
        await supabase.from("entities").update(clearRole).eq("id", id);
      }

      return NextResponse.json({
        ok: true,
        status: "not_found",
        entity: {
          ...row,
          ...clearRole,
        },
      });
    }

    return NextResponse.json(
      { error: "Wikidata lookup failed", details: result.message },
      { status: 502 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Unexpected failure", details: message },
      { status: 500 },
    );
  }
}
