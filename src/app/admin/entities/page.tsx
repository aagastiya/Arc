// Identity desk: who Arc thinks these people and organizations are, where that
// belief came from, and an editor's final say over it.

import Link from "next/link";

import { AdminNav } from "@/components/admin-nav";
import {
  AdminEntityRow,
  type AdminEntity,
  type EntityCandidate,
} from "@/components/admin-entity-row";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unverified", label: "Unverified" },
  { key: "ambiguous", label: "Ambiguous" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

type EntityRow = {
  id: string;
  kind: string;
  name: string;
  role_title: string | null;
  short_description: string | null;
  description_source: string | null;
  wikidata_id: string | null;
  identity_verified_at: string | null;
  identity_candidates: unknown;
};

function toCandidates(value: unknown): EntityCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      label: typeof item.label === "string" ? item.label : "",
      description: typeof item.description === "string" ? item.description : "",
    }))
    .filter((c) => c.id.length > 0);
}

export default async function AdminEntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const active: FilterKey = FILTERS.some((f) => f.key === filter)
    ? (filter as FilterKey)
    : "all";

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("entities")
    .select(
      "id,kind,name,role_title,short_description,description_source,wikidata_id,identity_verified_at,identity_candidates",
    )
    .order("name");

  if (error) {
    throw new Error(`Failed to load entities: ${error.message}`);
  }

  const { data: linkData, error: linkError } = await supabase
    .from("story_entities")
    .select("entity_id");

  if (linkError) {
    throw new Error(`Failed to load entity links: ${linkError.message}`);
  }

  const storyCounts = new Map<string, number>();
  for (const link of (linkData ?? []) as Array<{ entity_id: string }>) {
    storyCounts.set(link.entity_id, (storyCounts.get(link.entity_id) ?? 0) + 1);
  }

  const entities: AdminEntity[] = ((data ?? []) as EntityRow[]).map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    role_title: row.role_title ?? "",
    short_description: row.short_description ?? "",
    description_source: row.description_source ?? "model",
    wikidata_id: row.wikidata_id,
    identity_verified_at: row.identity_verified_at,
    candidates: toCandidates(row.identity_candidates),
    story_count: storyCounts.get(row.id) ?? 0,
  }));

  const counts = {
    all: entities.length,
    unverified: entities.filter((e) => e.identity_verified_at === null).length,
    ambiguous: entities.filter((e) => e.candidates.length > 0).length,
  } satisfies Record<FilterKey, number>;

  const visible = entities.filter((entity) => {
    if (active === "unverified") return entity.identity_verified_at === null;
    if (active === "ambiguous") return entity.candidates.length > 0;
    return true;
  });

  const anchored = entities.filter((e) => e.wikidata_id !== null).length;

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#c8ff00]">
              Entities
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {entities.length} known · {anchored} anchored to Wikidata ·{" "}
              {counts.ambiguous} need a ruling
            </p>
          </div>
          <AdminNav current="/admin/entities" />
        </div>

        <p className="mt-4 text-xs text-zinc-600">
          Identity is who someone is, not what they did this week. An editor&apos;s
          edit outranks Wikidata and can never be overwritten by extraction.
        </p>

        <nav aria-label="Filter entities" className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/admin/entities" : `/admin/entities?filter=${f.key}`}
              aria-current={f.key === active ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                f.key === active
                  ? "bg-[#c8ff00] text-black"
                  : "border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {f.label} {counts[f.key]}
            </Link>
          ))}
        </nav>

        {visible.length === 0 ? (
          <p className="mt-8 text-sm italic text-zinc-600">
            Nothing here.
          </p>
        ) : (
          <ul className="mt-4">
            {visible.map((entity) => (
              <AdminEntityRow key={entity.id} entity={entity} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
