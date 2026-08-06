/**
 * Anchor existing entities to Wikidata.
 *
 * Every entity written before the identity layer carries a model-authored
 * description, which is a guess dressed as a fact. This walks them all, asks
 * Wikidata who they are, and upgrades the ones it can identify. Nothing that an
 * editor or an earlier anchor has already settled is touched.
 *
 * Flags:
 *   --dry-run  report without writing
 *   --redo     also re-check entities already anchored to Wikidata, and drop the
 *              anchor if the name no longer resolves. Use after changing the
 *              matching rules. Human-edited entities are never touched.
 *
 * Run: npx tsx --env-file=.env.local scripts/anchor-entities.ts [--dry-run] [--redo]
 */
import { createClient } from "@supabase/supabase-js";

import { lookupEntity, type EntityKind } from "../src/lib/graph/wikidata";

const DELAY_MS = 300;

type EntityRow = {
  id: string;
  kind: string;
  name: string;
  short_description: string | null;
  role_title: string | null;
  description_source: string | null;
  wikidata_id: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const redo = process.argv.includes("--redo");
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const sources = redo ? ["model", "wikidata"] : ["model"];
  const { data, error } = await supabase
    .from("entities")
    .select("id,kind,name,short_description,role_title,description_source,wikidata_id")
    .in("description_source", sources)
    .order("name");

  if (error) throw new Error(`Failed to load entities: ${error.message}`);

  const rows = (data ?? []) as EntityRow[];
  console.log(
    `${rows.length} entities to check (${sources.join(", ")})${dryRun ? " (dry run)" : ""}\n`,
  );

  const matched: string[] = [];
  const notFound: string[] = [];
  const ambiguous: string[] = [];
  const dropped: string[] = [];
  const failed: string[] = [];

  for (const row of rows) {
    const kind: EntityKind = row.kind === "person" ? "person" : "organization";
    const oldDesc = row.short_description?.trim() || "(none)";
    const result = await lookupEntity(row.name, kind);

    if (result.status === "found") {
      const patch = {
        wikidata_id: result.id,
        short_description: result.description || row.short_description || "",
        role_title: result.roleTitle,
        description_source: "wikidata",
        identity_verified_at: new Date().toISOString(),
        identity_candidates: [],
      };

      if (!dryRun) {
        const { error: updErr } = await supabase
          .from("entities")
          .update(patch)
          .eq("id", row.id);
        if (updErr) {
          failed.push(`${row.name} — update failed: ${updErr.message}`);
          console.log(`FAILED     ${row.name}: ${updErr.message}`);
          await sleep(DELAY_MS);
          continue;
        }
      }

      matched.push(
        `${row.name} [${result.id}]\n    old: ${oldDesc}\n    new: ${patch.short_description}\n    role: ${result.roleTitle || "(none)"}`,
      );
      console.log(`MATCHED    ${row.name} → ${result.id} ${result.label}`);
    } else if (result.status === "ambiguous") {
      const candidates = result.candidates;
      // An anchor that is now merely one of several candidates was never safe.
      const clearAnchor = row.wikidata_id
        ? {
            wikidata_id: null,
            short_description: "",
            role_title: "",
            description_source: "model",
            identity_verified_at: null,
          }
        : {};

      if (!dryRun) {
        const { error: updErr } = await supabase
          .from("entities")
          .update({ ...clearAnchor, identity_candidates: candidates })
          .eq("id", row.id);
        if (updErr) {
          failed.push(`${row.name} — flag failed: ${updErr.message}`);
          console.log(`FAILED     ${row.name}: ${updErr.message}`);
          await sleep(DELAY_MS);
          continue;
        }
      }

      ambiguous.push(
        `${row.name} (kept: ${oldDesc})\n    candidates: ${candidates
          .map((c) => `${c.id} ${c.label} — ${c.description}`)
          .join("\n                ")}`,
      );
      console.log(
        `AMBIGUOUS  ${row.name} → ${candidates.length} candidates, flagged for an editor`,
      );
    } else if (result.status === "not_found") {
      // A name that no longer resolves but carries an anchor was matched under
      // the old rules and matched wrongly. The description came from that wrong
      // item, so it goes too — a blank is safer than a confident error.
      if (row.wikidata_id) {
        if (!dryRun) {
          const { error: updErr } = await supabase
            .from("entities")
            .update({
              wikidata_id: null,
              short_description: "",
              role_title: "",
              description_source: "model",
              identity_verified_at: null,
              identity_candidates: [],
            })
            .eq("id", row.id);
          if (updErr) {
            failed.push(`${row.name} — drop failed: ${updErr.message}`);
            console.log(`FAILED     ${row.name}: ${updErr.message}`);
            await sleep(DELAY_MS);
            continue;
          }
        }
        dropped.push(`${row.name} — dropped bad anchor ${row.wikidata_id} (was: ${oldDesc})`);
        console.log(`DROPPED    ${row.name} — bad anchor ${row.wikidata_id} removed`);
      } else {
        notFound.push(`${row.name} (kept: ${oldDesc})`);
        console.log(`NOT FOUND  ${row.name} — description kept`);
      }
    } else {
      failed.push(`${row.name} — ${result.message}`);
      console.log(`ERROR      ${row.name}: ${result.message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log("\n" + "=".repeat(70));
  console.log(
    `SUMMARY: ${matched.length} matched · ${notFound.length} not found · ${ambiguous.length} ambiguous · ${dropped.length} bad anchors dropped · ${failed.length} errors`,
  );

  console.log(`\nMATCHED (${matched.length})`);
  for (const line of matched) console.log(`  - ${line}`);

  console.log(`\nAMBIGUOUS — flagged for editor (${ambiguous.length})`);
  for (const line of ambiguous) console.log(`  - ${line}`);

  console.log(`\nNOT FOUND — description kept (${notFound.length})`);
  for (const line of notFound) console.log(`  - ${line}`);

  if (dropped.length > 0) {
    console.log(`\nDROPPED — wrong anchor removed (${dropped.length})`);
    for (const line of dropped) console.log(`  - ${line}`);
  }

  if (failed.length > 0) {
    console.log(`\nERRORS (${failed.length})`);
    for (const line of failed) console.log(`  - ${line}`);
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
