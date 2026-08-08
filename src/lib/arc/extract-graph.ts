import type OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canOverwrite,
  lookupEntity,
  type DescriptionSource,
  type WikidataCandidate,
} from "@/lib/graph/wikidata";

export const GRAPH_EXTRACT_PROMPT = `You are Arc's knowledge-graph extractor. Given Arc story text and a list of running events, return ONLY valid JSON (no markdown, no prose) in this exact shape:

{
  "entities": [
    {
      "kind": "person" | "organization" | "place",
      "name": "the name a newspaper reader knows",
      "aliases": ["other names used in the text"],
      "short_description": "one factual line, max 15 words",
      "role": "subject" | "mentioned"
    }
  ],
  "event": {
    "action": "match" | "propose" | "none",
    "event_id": "uuid when action is match, else omit or empty",
    "title": "when action is propose, short event title e.g. US–Iran conflict",
    "open_question": "when action is propose, a specific resolvable stake as a question"
  }
}

Rules:
- Max 8 entities. Fewer, stronger entities beats more.
- kind: "person" for people; "organization" for companies, agencies, institutions, parties, armed forces, courts; "place" for countries, cities, regions, territories, and geographic features. Countries and cities are places, NEVER organizations.
- Graph-worthiness: only extract people, organizations, and places likely to recur in news coverage — public officials, public figures, companies, institutions, agencies, and named places central to the story. NEVER extract private individuals who are merely quoted or affected (residents, witnesses, victims, bystanders). If unsure, leave them out.
- Common name: "name" is the name most commonly used for this entity IN THE SOURCE TEXT — the form a newspaper reader already knows. Prefer "Bernie Moreno" over "Bernie Moreno-Mejía" when the story mostly says Moreno; prefer "National Cyber Security Centre" over a longer official form the text never uses.
- Copy the spelling exactly as it appears in the source. Never "correct", expand, or reformat a name from your own knowledge.
- Never invent background, biography, or historical context from your own knowledge. Every factual claim in short_description must come from the story text; if the text does not support a description, leave short_description empty.
- Never output possessive or descriptive phrases as names. "UK's National Cyber Security Centre" → "National Cyber Security Centre". "Iran's military" is not a name — skip it, or use only a proper noun the text gives for that force. Strip leading possessives ("X's …") yourself before writing the name.
- Prefer the fullest form that actually appears in the text when several forms appear equally often (e.g. "John Farinacci", not "Farinacci"). If the article only ever gives a partial name, use that.
- role = "subject" if the story is primarily about them; otherwise "mentioned".
- short_description: factual, neutral, Arc voice. No opinion, speculation, or framing verbs (highlights, underscores, signals, etc.). Prefer "" over inventing facts.
- NEVER state a role, title, office, or job from your own knowledge. Only describe someone as a president, chief executive, senator, director, or minister if the story text says so. If the story text does not give a role, leave short_description empty rather than supplying one you happen to know.
- aliases: only names that appear in the story text; may be [].
- Running events are provided below. action = "match" only if this story clearly belongs to one listed event — use that event's id.
- action = "propose" ONLY if this situation will clearly keep producing ongoing news (a durable thread). Provide title + open_question.
- open_question rules (propose only): must name a specific outcome; must be answerable yes/no or A-or-B; must be resolvable by a future news event. BAD: "How will this affect US-Iran relations?" GOOD: "Does the Hormuz deal hold and reopen the strait, or does the fighting resume?"
- action = "none" if neither match nor a durable new thread fits. Prefer "none" over a weak propose.
- Never invent people, organizations, places, or event ids not justified by the story / candidate list.`;

export type GraphEntityKind = "person" | "organization" | "place";

export type GraphEntityOut = {
  kind: GraphEntityKind;
  name: string;
  aliases: string[];
  short_description: string;
  role: "subject" | "mentioned";
  id: string;
  role_title: string;
  wikidata_id: string | null;
  description_source: DescriptionSource;
};

export type GraphEventOut = {
  action: "match" | "propose" | "none";
  event_id: string | null;
  title: string | null;
  open_question: string | null;
};

export type GraphResult = {
  entities: GraphEntityOut[];
  event: GraphEventOut;
};

type RunningEvent = {
  id: string;
  title: string;
  open_question: string;
};

type EntityRow = {
  id: string;
  kind: string;
  name: string;
  aliases: string[] | null;
  short_description: string;
  role_title: string | null;
  wikidata_id: string | null;
  description_source: string | null;
  identity_verified_at: string | null;
};

export const ENTITY_SELECT =
  "id,kind,name,aliases,short_description,role_title,wikidata_id,description_source,identity_verified_at";

function lower(s: string): string {
  return s.trim().toLowerCase();
}

/** Match proposed event titles to running ones the same way the editor scan does. */
export function normalizeEventTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-") // dash variants → ASCII hyphen
    .replace(/\s+/g, " ");
}

const GROUNDING_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "in", "on", "at", "to", "from",
  "with", "by", "is", "was", "are", "were", "be", "been", "as", "that", "this",
  "who", "which", "its", "his", "her", "their", "has", "have", "had",
]);

/**
 * Does this description come from the story, or from what the model happens to
 * know? Only descriptions built out of words the story actually used survive an
 * unmatched Wikidata lookup.
 */
function isGroundedIn(description: string, storyText: string): boolean {
  const haystack = ` ${storyText.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !GROUNDING_STOPWORDS.has(w));

  if (words.length === 0) return false;
  const present = words.filter((w) => haystack.includes(` ${w} `)).length;
  return present / words.length >= 0.7;
}

function uniqueAliases(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const k = lower(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * Safety net after the model: possessive phrases are not names.
 * "UK's National Cyber Security Centre" → "National Cyber Security Centre".
 * "Iran's military" → null (skip — bare common nouns are not graph entities).
 */
export function normalizeExtractedEntityName(raw: string): string | null {
  let name = raw.trim().replace(/\s+/g, " ");
  if (!name) return null;

  name = name.replace(/^the\s+/i, "").trim();

  const possessive = name.match(/^(.+?)['']s\s+(.+)$/i);
  if (possessive) {
    name = possessive[2]!.trim();
  }

  if (!name) return null;
  if (!/^[A-Z0-9]/.test(name)) return null;

  // After stripping a possessive, a bare force/body noun is not an identity.
  if (
    /^(military|government|army|navy|air force|police|forces|ministry|department|authorities|officials)$/i.test(
      name,
    )
  ) {
    return null;
  }

  return name;
}

function entityMatches(
  row: EntityRow,
  kind: string,
  name: string,
  aliases: string[],
): boolean {
  if (row.kind !== kind) return false;
  const names = [row.name, ...(row.aliases ?? [])].map(lower);
  const probes = [name, ...aliases].map(lower).filter(Boolean);
  return probes.some((p) => names.includes(p));
}

function buildStoryText(input: {
  headline: string;
  summary: string;
  keyPoints: Array<{ text: string; source: string }>;
  report: { lead: string; sections: Array<{ title: string; body: string }> } | null;
  storyline: unknown;
}): string {
  const parts: string[] = [
    `Headline: ${input.headline}`,
    `Summary: ${input.summary}`,
  ];

  if (input.keyPoints.length > 0) {
    parts.push(
      "Key points:",
      ...input.keyPoints.map(
        (p, i) =>
          `${i + 1}. ${p.text}${p.source ? ` (${p.source})` : ""}`,
      ),
    );
  }

  if (input.report) {
    parts.push(`Lead: ${input.report.lead}`);
    for (const section of input.report.sections) {
      parts.push(`${section.title}: ${section.body}`);
    }
  }

  if (Array.isArray(input.storyline) && input.storyline.length > 0) {
    parts.push("Storyline:");
    for (const item of input.storyline) {
      if (!item || typeof item !== "object") continue;
      const e = item as Record<string, unknown>;
      if (typeof e.date === "string" && typeof e.event === "string") {
        parts.push(`- ${e.date}: ${e.event}`);
      }
    }
  }

  return parts.join("\n");
}

function parseExtraction(raw: unknown): {
  entities: Array<{
    kind: GraphEntityKind;
    name: string;
    aliases: string[];
    short_description: string;
    role: "subject" | "mentioned";
  }>;
  event: {
    action: "match" | "propose" | "none";
    event_id: string;
    title: string;
    open_question: string;
  };
} | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const entitiesRaw = Array.isArray(obj.entities) ? obj.entities : [];
  const entities: Array<{
    kind: GraphEntityKind;
    name: string;
    aliases: string[];
    short_description: string;
    role: "subject" | "mentioned";
  }> = [];

  for (const item of entitiesRaw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const kind =
      e.kind === "person" || e.kind === "organization" || e.kind === "place"
        ? e.kind
        : null;
    const role = e.role === "subject" || e.role === "mentioned" ? e.role : null;
    if (!kind || !role || typeof e.name !== "string" || !e.name.trim()) continue;
    const name = normalizeExtractedEntityName(e.name);
    if (!name) continue;
    const aliases = Array.isArray(e.aliases)
      ? e.aliases.filter((a): a is string => typeof a === "string")
      : [];
    entities.push({
      kind,
      name,
      aliases: uniqueAliases(
        aliases
          .map((a) => normalizeExtractedEntityName(a) ?? a.trim())
          .filter(Boolean),
      ).filter((a) => lower(a) !== lower(name)),
      short_description:
        typeof e.short_description === "string" ? e.short_description.trim() : "",
      role,
    });
  }

  const eventObj =
    obj.event && typeof obj.event === "object"
      ? (obj.event as Record<string, unknown>)
      : {};
  const action =
    eventObj.action === "match" ||
    eventObj.action === "propose" ||
    eventObj.action === "none"
      ? eventObj.action
      : "none";

  return {
    entities,
    event: {
      action,
      event_id: typeof eventObj.event_id === "string" ? eventObj.event_id.trim() : "",
      title: typeof eventObj.title === "string" ? eventObj.title.trim() : "",
      open_question:
        typeof eventObj.open_question === "string"
          ? eventObj.open_question.trim()
          : "",
    },
  };
}

type ResolvedIdentity = {
  name: string;
  wikidataLabel: string | null;
  shortDescription: string;
  roleTitle: string;
  wikidataId: string | null;
  source: DescriptionSource;
  verifiedAt: string | null;
  candidates: WikidataCandidate[];
};

/**
 * Decide what a newly seen entity is, in this order: Wikidata if it answers
 * clearly, the story's own words if not, and the model's sentence only when it
 * cannot be traced to the story — in which case it is marked as such. Anchoring
 * is best-effort; a Wikidata outage must not stop the graph.
 *
 * The display name stays the newspaper name from the story. Wikidata's label,
 * when different, becomes an alias — the QID is the link, not a rename.
 */
async function resolveNewIdentity(
  ent: { kind: GraphEntityKind; name: string; short_description: string },
  storyText: string,
): Promise<ResolvedIdentity> {
  const grounded = isGroundedIn(ent.short_description, storyText);
  const fallback: ResolvedIdentity = {
    name: ent.name,
    wikidataLabel: null,
    shortDescription: grounded ? ent.short_description : "",
    roleTitle: "",
    wikidataId: null,
    source: grounded ? "source_text" : "model",
    verifiedAt: null,
    candidates: [],
  };

  let lookup;
  try {
    lookup = await lookupEntity(ent.name, ent.kind);
  } catch {
    return fallback;
  }

  if (lookup.status === "found") {
    return {
      name: ent.name,
      wikidataLabel: lookup.label || null,
      shortDescription: lookup.description || fallback.shortDescription,
      roleTitle: lookup.roleTitle,
      wikidataId: lookup.id,
      source: "wikidata",
      verifiedAt: new Date().toISOString(),
      candidates: [],
    };
  }

  if (lookup.status === "ambiguous") {
    // Several people share this name; an editor picks, and until then the
    // model's line is labelled for what it is.
    return {
      ...fallback,
      shortDescription: ent.short_description,
      source: "model",
      candidates: lookup.candidates,
    };
  }

  return fallback;
}

export async function extractAndPersistGraph(opts: {
  openai: OpenAI;
  supabase: SupabaseClient;
  storyId: string;
  headline: string;
  summary: string;
  keyPoints: Array<{ text: string; source: string }>;
  report: { lead: string; sections: Array<{ title: string; body: string }> } | null;
  storyline: unknown;
}): Promise<GraphResult> {
  const { data: runningRows, error: runningErr } = await opts.supabase
    .from("events")
    .select("id,title,open_question")
    .eq("status", "running");

  if (runningErr) {
    throw new Error(`Failed to load running events: ${runningErr.message}`);
  }

  const running = (runningRows ?? []) as RunningEvent[];
  const runningIds = new Set(running.map((e) => e.id));
  const runningByTitle = new Map(
    running.map((e) => [normalizeEventTitle(e.title), e]),
  );

  const storyText = buildStoryText({
    headline: opts.headline,
    summary: opts.summary,
    keyPoints: opts.keyPoints,
    report: opts.report,
    storyline: opts.storyline,
  });

  const candidatesBlock =
    running.length === 0
      ? "(none — no running events yet)"
      : running
          .map(
            (e) =>
              `- id: ${e.id}\n  title: ${e.title}\n  open_question: ${e.open_question || "(none)"}`,
          )
          .join("\n");

  const userMessage = `Running events (candidates for match):\n${candidatesBlock}\n\nArc story text:\n${storyText}`;

  const completion = await opts.openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: GRAPH_EXTRACT_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Graph extraction returned empty response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error("Graph extraction returned invalid JSON");
  }

  const extracted = parseExtraction(parsedJson);
  if (!extracted) {
    throw new Error("Graph extraction JSON failed validation");
  }

  const { data: existingEntities, error: entFetchErr } = await opts.supabase
    .from("entities")
    .select(ENTITY_SELECT);

  if (entFetchErr) {
    throw new Error(`Failed to load entities: ${entFetchErr.message}`);
  }

  let entityPool = (existingEntities ?? []) as EntityRow[];
  const graphEntities: GraphEntityOut[] = [];

  for (const ent of extracted.entities) {
    const found = entityPool.find((row) =>
      entityMatches(row, ent.kind, ent.name, ent.aliases),
    );

    if (found) {
      const mergedAliases = uniqueAliases([
        ...(found.aliases ?? []),
        ...ent.aliases,
        ...(lower(found.name) !== lower(ent.name) ? [ent.name] : []),
      ]).filter((a) => lower(a) !== lower(found.name));

      // Aliases accumulate freely, but identity is never rewritten from a story:
      // an empty description may be filled, an existing one is left alone.
      const patch: {
        aliases?: string[];
        short_description?: string;
        description_source?: DescriptionSource;
      } = {};
      if (mergedAliases.length !== (found.aliases ?? []).length) {
        patch.aliases = mergedAliases;
      }

      const incomingSource: DescriptionSource = isGroundedIn(
        ent.short_description,
        storyText,
      )
        ? "source_text"
        : "model";

      if (
        !found.short_description?.trim() &&
        ent.short_description &&
        canOverwrite(found.description_source, incomingSource)
      ) {
        patch.short_description = ent.short_description;
        patch.description_source = incomingSource;
      }

      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await opts.supabase
          .from("entities")
          .update(patch)
          .eq("id", found.id);
        if (updErr) {
          throw new Error(`Failed to update entity: ${updErr.message}`);
        }
        found.aliases = patch.aliases ?? found.aliases;
        found.short_description =
          patch.short_description ?? found.short_description;
        found.description_source =
          patch.description_source ?? found.description_source;
      }

      const { error: linkErr } = await opts.supabase.from("story_entities").upsert(
        {
          story_id: opts.storyId,
          entity_id: found.id,
          role: ent.role,
          approved: false,
        },
        { onConflict: "story_id,entity_id" },
      );
      if (linkErr) {
        throw new Error(`Failed to link story entity: ${linkErr.message}`);
      }

      graphEntities.push({
        kind: ent.kind,
        name: found.name,
        aliases: uniqueAliases(found.aliases ?? []),
        short_description: found.short_description || ent.short_description,
        role: ent.role,
        id: found.id,
        role_title: found.role_title ?? "",
        wikidata_id: found.wikidata_id,
        description_source: (found.description_source ??
          "model") as DescriptionSource,
      });
      continue;
    }

    // A name Arc has not seen before: ask Wikidata who this is before trusting
    // the model's sentence about them.
    const identity = await resolveNewIdentity(ent, storyText);

    const { data: inserted, error: insErr } = await opts.supabase
      .from("entities")
      .insert({
        kind: ent.kind,
        name: identity.name,
        aliases: uniqueAliases([
          ...ent.aliases,
          ...(identity.wikidataLabel &&
          lower(identity.wikidataLabel) !== lower(identity.name)
            ? [identity.wikidataLabel]
            : []),
        ]).filter((a) => lower(a) !== lower(identity.name)),
        short_description: identity.shortDescription,
        role_title: identity.roleTitle,
        wikidata_id: identity.wikidataId,
        description_source: identity.source,
        identity_verified_at: identity.verifiedAt,
        identity_candidates: identity.candidates,
      })
      .select(ENTITY_SELECT)
      .single();

    if (insErr || !inserted) {
      throw new Error(`Failed to insert entity: ${insErr?.message ?? "unknown"}`);
    }

    const row = inserted as EntityRow;
    entityPool = [...entityPool, row];

    const { error: linkErr } = await opts.supabase.from("story_entities").upsert(
      {
        story_id: opts.storyId,
        entity_id: row.id,
        role: ent.role,
        approved: false,
      },
      { onConflict: "story_id,entity_id" },
    );
    if (linkErr) {
      throw new Error(`Failed to link story entity: ${linkErr.message}`);
    }

    graphEntities.push({
      kind: ent.kind,
      name: row.name,
      aliases: uniqueAliases(row.aliases ?? []),
      short_description: row.short_description,
      role: ent.role,
      id: row.id,
      role_title: row.role_title ?? "",
      wikidata_id: row.wikidata_id,
      description_source: (row.description_source ??
        "model") as DescriptionSource,
    });
  }

  let eventOut: GraphEventOut = {
    action: "none",
    event_id: null,
    title: null,
    open_question: null,
  };

  if (extracted.event.action === "match" && extracted.event.event_id) {
    if (!runningIds.has(extracted.event.event_id)) {
      // Invalid id — treat as none rather than failing the whole graph pass
      eventOut = {
        action: "none",
        event_id: null,
        title: null,
        open_question: null,
      };
    } else {
      const { error: seErr } = await opts.supabase.from("story_events").upsert(
        {
          story_id: opts.storyId,
          event_id: extracted.event.event_id,
          approved: false,
        },
        { onConflict: "story_id,event_id" },
      );
      if (seErr) {
        throw new Error(`Failed to link story event: ${seErr.message}`);
      }
      const matched = running.find((e) => e.id === extracted.event.event_id);
      eventOut = {
        action: "match",
        event_id: extracted.event.event_id,
        title: matched?.title ?? null,
        open_question: matched?.open_question ?? null,
      };
    }
  } else if (
    extracted.event.action === "propose" &&
    extracted.event.title
  ) {
    // Same guard as the editor scan: a proposed title that already exists as a
    // running event is a match, not a new insert.
    const duplicate = runningByTitle.get(
      normalizeEventTitle(extracted.event.title),
    );
    if (duplicate) {
      const { error: seErr } = await opts.supabase.from("story_events").upsert(
        {
          story_id: opts.storyId,
          event_id: duplicate.id,
          approved: false,
        },
        { onConflict: "story_id,event_id" },
      );
      if (seErr) {
        throw new Error(`Failed to link story event: ${seErr.message}`);
      }
      eventOut = {
        action: "match",
        event_id: duplicate.id,
        title: duplicate.title,
        open_question: duplicate.open_question || null,
      };
    } else {
      const { data: newEvent, error: evErr } = await opts.supabase
        .from("events")
        .insert({
          title: extracted.event.title,
          open_question: extracted.event.open_question || "",
          status: "running",
        })
        .select("id,title,open_question")
        .single();

      if (evErr || !newEvent) {
        throw new Error(`Failed to insert event: ${evErr?.message ?? "unknown"}`);
      }

      const { error: seErr } = await opts.supabase.from("story_events").upsert(
        {
          story_id: opts.storyId,
          event_id: newEvent.id as string,
          approved: false,
        },
        { onConflict: "story_id,event_id" },
      );
      if (seErr) {
        throw new Error(`Failed to link proposed event: ${seErr.message}`);
      }

      eventOut = {
        action: "propose",
        event_id: newEvent.id as string,
        title: newEvent.title as string,
        open_question: (newEvent.open_question as string) || "",
      };
    }
  }

  return { entities: graphEntities, event: eventOut };
}
