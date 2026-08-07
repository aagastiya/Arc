/**
 * Anchor existing entities to Wikidata.
 *
 * Walks entities whose identity still comes from the model (or, with --redo,
 * from an earlier Wikidata pass) and asks Wikidata who they are. The display
 * name never changes — Wikidata's label becomes an alias when it differs.
 * role_title is set only from a real position claim (P39), never from the
 * English description.
 *
 * Flags:
 *   --dry-run  report without writing
 *   --redo     also re-check entities already anchored to Wikidata, drop bad
 *              anchors, clear description-shaped role_titles, and add Wikidata
 *              labels as aliases without renaming. Human-edited entities are
 *              never touched.
 *
 * Run: npx tsx --env-file=.env.local scripts/anchor-entities.ts [--dry-run] [--redo]
 */
import { createClient } from "@supabase/supabase-js";

import {
  isRoleTitleFromDescription,
  lookupEntity,
  type EntityKind,
} from "../src/lib/graph/wikidata";
import { normalizeExtractedEntityName } from "../src/lib/arc/extract-graph";

const DELAY_MS = 300;

type EntityRow = {
  id: string;
  kind: string;
  name: string;
  aliases: string[] | null;
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

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const redo = process.argv.includes("--redo");
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const sources = redo ? ["model", "wikidata", "source_text"] : ["model"];
  const { data, error } = await supabase
    .from("entities")
    .select(
      "id,kind,name,aliases,short_description,role_title,description_source,wikidata_id",
    )
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
  const roleCleared: string[] = [];
  const aliasAdded: string[] = [];
  const namesFixed: string[] = [];
  const failed: string[] = [];

  for (const row of rows) {
    // Repair extraction pollution: possessive phrases are not display names.
    // This is not a Wikidata rename — it restores the newspaper form.
    let working = row;
    if (redo) {
      const normalized = normalizeExtractedEntityName(row.name);
      if (normalized && normalized !== row.name) {
        if (!dryRun) {
          const { error: nameErr } = await supabase
            .from("entities")
            .update({ name: normalized })
            .eq("id", row.id);
          if (nameErr) {
            failed.push(`${row.name} — name fix failed: ${nameErr.message}`);
            console.log(`FAILED     ${row.name}: ${nameErr.message}`);
            await sleep(DELAY_MS);
            continue;
          }
        }
        namesFixed.push(`${row.name} → ${normalized}`);
        console.log(`NAME FIX   ${row.name} → ${normalized}`);
        working = { ...row, name: normalized };
      } else if (normalized === null && /['']s\s+/i.test(row.name)) {
        // Irreducible possessive junk ("Iran's military") — leave for an editor;
        // lookup will miss it anyway.
        console.log(`NAME SKIP  ${row.name} — possessive with no proper noun`);
      }
    }

    const kind: EntityKind =
      working.kind === "person" ? "person" : "organization";
    const oldDesc = working.short_description?.trim() || "(none)";
    const oldRole = working.role_title?.trim() || "";
    const result = await lookupEntity(working.name, kind);

    if (result.status === "found") {
      const aliases = mergeAliases(working.aliases, working.name, result.label);
      const aliasChanged =
        aliases.length !== (working.aliases ?? []).length ||
        aliases.some(
          (a, i) => lower(a) !== lower((working.aliases ?? [])[i] ?? ""),
        );
      const roleTitle = result.roleTitle;
      const roleChanged = roleTitle !== oldRole;

      const patch = {
        // Name stays the newspaper name. Wikidata label rides as an alias.
        wikidata_id: result.id,
        short_description:
          result.description || working.short_description || "",
        role_title: roleTitle,
        aliases,
        description_source: "wikidata",
        identity_verified_at: new Date().toISOString(),
        identity_candidates: [],
      };

      if (!dryRun) {
        const { error: updErr } = await supabase
          .from("entities")
          .update(patch)
          .eq("id", working.id);
        if (updErr) {
          failed.push(`${working.name} — update failed: ${updErr.message}`);
          console.log(`FAILED     ${working.name}: ${updErr.message}`);
          await sleep(DELAY_MS);
          continue;
        }
      }

      if (
        result.label &&
        lower(result.label) !== lower(working.name) &&
        aliasChanged
      ) {
        aliasAdded.push(
          `${working.name} — kept name, alias +${result.label}`,
        );
      }
      if (oldRole && !roleTitle) {
        roleCleared.push(
          `${working.name} — cleared role_title "${oldRole}" (no position claim)`,
        );
      } else if (oldRole && roleTitle && oldRole !== roleTitle) {
        roleCleared.push(
          `${working.name} — role_title "${oldRole}" → "${roleTitle}"`,
        );
      }

      matched.push(
        `${working.name} [${result.id}]\n    name kept: ${working.name}` +
          (result.label && lower(result.label) !== lower(working.name)
            ? ` (wikidata label → alias: ${result.label})`
            : "") +
          `\n    old: ${oldDesc}\n    new: ${patch.short_description}` +
          `\n    role: ${roleTitle || "(none)"}${roleChanged && oldRole ? ` (was: ${oldRole})` : ""}`,
      );
      console.log(
        `MATCHED    ${working.name} → ${result.id} ${result.label}` +
          (lower(result.label) !== lower(working.name) ? " (name kept)" : ""),
      );
    } else if (result.status === "ambiguous") {
      const candidates = result.candidates;
      const clearRole =
        oldRole &&
        isRoleTitleFromDescription(oldRole, working.short_description)
          ? { role_title: "" }
          : {};
      const clearAnchor = row.wikidata_id
        ? {
            wikidata_id: null,
            short_description: "",
            role_title: "",
            description_source: "model",
            identity_verified_at: null,
          }
        : clearRole;

      if (!dryRun) {
        const { error: updErr } = await supabase
          .from("entities")
          .update({ ...clearAnchor, identity_candidates: candidates })
          .eq("id", working.id);
        if (updErr) {
          failed.push(`${working.name} — flag failed: ${updErr.message}`);
          console.log(`FAILED     ${working.name}: ${updErr.message}`);
          await sleep(DELAY_MS);
          continue;
        }
      }

      if (clearRole.role_title === "" || (row.wikidata_id && oldRole)) {
        roleCleared.push(
          `${working.name} — cleared role_title "${oldRole}" (ambiguous)`,
        );
      }

      ambiguous.push(
        `${working.name} (kept: ${oldDesc})\n    candidates: ${candidates
          .map((c) => `${c.id} ${c.label} — ${c.description}`)
          .join("\n                ")}`,
      );
      console.log(
        `AMBIGUOUS  ${working.name} → ${candidates.length} candidates, flagged for an editor`,
      );
    } else if (result.status === "not_found") {
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
            .eq("id", working.id);
          if (updErr) {
            failed.push(`${working.name} — drop failed: ${updErr.message}`);
            console.log(`FAILED     ${working.name}: ${updErr.message}`);
            await sleep(DELAY_MS);
            continue;
          }
        }
        dropped.push(
          `${working.name} — dropped bad anchor ${row.wikidata_id} (was: ${oldDesc})`,
        );
        console.log(
          `DROPPED    ${working.name} — bad anchor ${row.wikidata_id} removed`,
        );
      } else {
        // Hygiene: clear a role_title that is just the description in disguise.
        if (
          oldRole &&
          isRoleTitleFromDescription(oldRole, working.short_description)
        ) {
          if (!dryRun) {
            const { error: updErr } = await supabase
              .from("entities")
              .update({ role_title: "" })
              .eq("id", working.id);
            if (updErr) {
              failed.push(
                `${working.name} — role clear failed: ${updErr.message}`,
              );
              console.log(`FAILED     ${working.name}: ${updErr.message}`);
              await sleep(DELAY_MS);
              continue;
            }
          }
          roleCleared.push(
            `${working.name} — cleared role_title "${oldRole}" (matched description)`,
          );
          console.log(
            `ROLE CLEAR ${working.name} — "${oldRole}" was description-shaped`,
          );
        } else {
          notFound.push(`${working.name} (kept: ${oldDesc})`);
          console.log(`NOT FOUND  ${working.name} — description kept`);
        }
      }
    } else {
      failed.push(`${working.name} — ${result.message}`);
      console.log(`ERROR      ${working.name}: ${result.message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log("\n" + "=".repeat(70));
  console.log(
    `SUMMARY: ${matched.length} matched · ${notFound.length} not found · ${ambiguous.length} ambiguous · ${dropped.length} bad anchors dropped · ${roleCleared.length} role_titles cleaned · ${aliasAdded.length} aliases added · ${namesFixed.length} names fixed · ${failed.length} errors`,
  );

  console.log(`\nMATCHED (${matched.length})`);
  for (const line of matched) console.log(`  - ${line}`);

  console.log(`\nNAMES FIXED — possessive stripped (${namesFixed.length})`);
  for (const line of namesFixed) console.log(`  - ${line}`);

  console.log(`\nALIASES ADDED — name kept (${aliasAdded.length})`);
  for (const line of aliasAdded) console.log(`  - ${line}`);

  console.log(`\nROLE_TITLE CLEANED (${roleCleared.length})`);
  for (const line of roleCleared) console.log(`  - ${line}`);

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
