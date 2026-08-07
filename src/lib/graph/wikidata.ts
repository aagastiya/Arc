// Wikidata anchoring for graph entities.
// Two public endpoints, no key: wbsearchentities to find candidates, then
// wbgetentities to check what each candidate actually is. Every call is bounded
// by a short timeout — anchoring is a nice-to-have and must never hold up a
// story.

const API = "https://www.wikidata.org/w/api.php";
const USER_AGENT =
  "ArcNewsBot/1.0 (https://arc.news; entity identity anchoring; contact: editors@arc.news)";
const TIMEOUT_MS = 5_000;
const SEARCH_LIMIT = 12;
const MAX_CANDIDATES = 5;

export type EntityKind = "person" | "organization";

export type WikidataCandidate = {
  id: string;
  label: string;
  description: string;
};

export type WikidataLookup =
  | ({ status: "found"; roleTitle: string } & WikidataCandidate)
  | { status: "ambiguous"; candidates: WikidataCandidate[] }
  | { status: "not_found" }
  | { status: "error"; message: string };

/** instance-of values that make something a person. */
const HUMAN_TYPES = new Set(["Q5"]);

/**
 * instance-of values that make something an organization, loosely. Arc files
 * everything that is not a person as an organization, so countries, courts and
 * ministries belong here too.
 */
const ORG_TYPES = new Set([
  "Q6256", // country
  "Q3624078", // sovereign state
  "Q7275", // state
  "Q107390", // federal state
  "Q515", // city
  "Q41487", // court
  "Q19953632", // former administrative territorial entity
  "Q11204", // legislative body / parliament
  "Q2919801", // parliamentary committee
  "Q192350", // ministry
  "Q1250464", // realm
  "Q1006644", // supreme court
  "Q1770945", // ministry of a country
  "Q43229", // organization
  "Q4830453", // business
  "Q6881511", // enterprise
  "Q891723", // public company
  "Q783794", // company
  "Q167037", // corporation
  "Q327333", // government agency
  "Q2659904", // government organization
  "Q7278", // political party
  "Q484652", // international organization
  "Q163740", // nonprofit organization
  "Q31855", // research institute
  "Q3918", // university
  "Q2085381", // publisher
  "Q11032", // newspaper
  "Q1616075", // television station
  "Q1002697", // periodical
  "Q192283", // news agency
  "Q17127659", // terrorist organization
  "Q15911314", // association
  "Q245065", // intergovernmental organization
  "Q79913", // non-governmental organization
  "Q4438121", // sports organization
  "Q847017", // sports club
  "Q748720", // armed forces branch
  "Q1785271", // military unit
  "Q476028", // association football club
  "Q12973014", // sports team
]);

/**
 * Claims that only an organization tends to carry. Wikidata's type tree is deep
 * and we deliberately do not walk it, so these act as a second chance for orgs
 * filed under a type not listed above.
 */
const ORG_SIGNAL_PROPERTIES = [
  "P159", // headquarters location
  "P452", // industry
  "P1454", // legal form
  "P169", // chief executive officer
  "P112", // founded by
  "P1128", // employees
  "P749", // parent organization
];

type Claim = {
  mainsnak?: {
    datavalue?: { value?: { id?: string } | string | number };
  };
  qualifiers?: Record<string, Array<{ snaktype?: string }>>;
  rank?: string;
};

type WikidataEntity = {
  id?: string;
  labels?: Record<string, { value?: string }>;
  descriptions?: Record<string, { value?: string }>;
  aliases?: Record<string, Array<{ value?: string }>>;
  claims?: Record<string, Claim[]>;
};

/**
 * How much more documented the leading candidate must be before it wins outright.
 * Statement count stands in for notability: the president has hundreds of claims,
 * his obscure namesake has a handful.
 */
const DOMINANCE_RATIO = 3;

/** Misses are cheap to repeat but pointless to; cleared when the process ends. */
const missCache = new Set<string>();

function missKey(name: string, kind: EntityKind): string {
  return `${kind}:${name.trim().toLowerCase()}`;
}

async function getJson(params: Record<string, string>): Promise<unknown> {
  const url = `${API}?${new URLSearchParams({ format: "json", ...params })}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Wikidata responded ${res.status}`);
  }
  return res.json();
}

function claimIds(entity: WikidataEntity, property: string): string[] {
  const claims = entity.claims?.[property] ?? [];
  const ids: string[] = [];
  for (const claim of claims) {
    if (claim.rank === "deprecated") continue;
    const value = claim.mainsnak?.datavalue?.value;
    const id = typeof value === "object" && value !== null ? value.id : undefined;
    if (id) ids.push(id);
  }
  return ids;
}

function isHuman(entity: WikidataEntity): boolean {
  return claimIds(entity, "P31").some((t) => HUMAN_TYPES.has(t));
}

/** Right sort of thing for this kind — a boost, not a gate, for organizations. */
function isPlausible(entity: WikidataEntity, kind: EntityKind): boolean {
  if (kind === "person") return isHuman(entity);
  if (isHuman(entity)) return false;
  if (claimIds(entity, "P31").some((t) => ORG_TYPES.has(t))) return true;
  return ORG_SIGNAL_PROPERTIES.some(
    (property) => (entity.claims?.[property]?.length ?? 0) > 0,
  );
}

/**
 * Names Wikidata cannot honestly resolve. A surname alone finds whichever
 * historical figure shares it — an arson suspect called Farinacci matched a
 * 1940s Italian fascist — and a common noun like "government" or "water
 * company" matches whatever the search engine feels like. Both are worse than
 * no anchor at all.
 */
function isLookupWorthy(name: string, kind: EntityKind): boolean {
  const trimmed = name.trim();
  // Two letters is a real name for an organization: BP, UN, EU.
  if (trimmed.length < 2) return false;

  // Proper nouns start with a capital; "the King" and "chicken producer" do not.
  if (!/^[A-Z0-9]/.test(trimmed)) return false;

  // Possessive phrasing describes a thing rather than naming it: "Iran's military".
  if (/['’]s\b/.test(trimmed)) return false;

  if (kind === "person") {
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length < 2) return false;
    // A title is not a name: "Prime Minister Modi" would anchor to the office.
    if (/^(president|prime minister|senator|governor|mr|mrs|ms|dr|sir|the)\b/i.test(trimmed)) {
      return false;
    }
  }

  return true;
}

/**
 * Position currently held: a P39 claim with no end date. Wikidata lists former
 * roles alongside current ones, so an end date is what rules a claim out.
 */
function currentPositionId(entity: WikidataEntity): string | null {
  const claims = entity.claims?.P39 ?? [];
  let fallback: string | null = null;

  for (const claim of claims) {
    if (claim.rank === "deprecated") continue;
    const value = claim.mainsnak?.datavalue?.value;
    const id = typeof value === "object" && value !== null ? value.id : undefined;
    if (!id) continue;

    const ended = (claim.qualifiers?.P582 ?? []).some(
      (q) => q.snaktype === "value",
    );
    if (!ended) {
      if (claim.rank === "preferred") return id;
      fallback ??= id;
    }
  }
  return fallback;
}

function labelOf(entity: WikidataEntity): string {
  return entity.labels?.en?.value?.trim() ?? "";
}

function descriptionOf(entity: WikidataEntity): string {
  return entity.descriptions?.en?.value?.trim() ?? "";
}

/** Every English name the item answers to, so "Federal Reserve" finds "Federal Reserve System". */
function namesOf(entity: WikidataEntity): string[] {
  const aliases = (entity.aliases?.en ?? [])
    .map((a) => a.value?.trim() ?? "")
    .filter(Boolean);
  return [labelOf(entity), ...aliases]
    .filter(Boolean)
    .map((n) => n.toLowerCase());
}

function claimCount(entity: WikidataEntity): number {
  return Object.values(entity.claims ?? {}).reduce(
    (sum, claims) => sum + claims.length,
    0,
  );
}

async function fetchEntities(ids: string[]): Promise<WikidataEntity[]> {
  if (ids.length === 0) return [];
  const data = (await getJson({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "labels|descriptions|aliases|claims",
    languages: "en",
  })) as { entities?: Record<string, WikidataEntity> };

  return ids
    .map((id) => data.entities?.[id])
    .filter((e): e is WikidataEntity => Boolean(e));
}

async function labelFor(id: string): Promise<string> {
  const data = (await getJson({
    action: "wbgetentities",
    ids: id,
    props: "labels",
    languages: "en",
  })) as { entities?: Record<string, WikidataEntity> };
  return labelOf(data.entities?.[id] ?? {});
}

function toCandidate(entity: WikidataEntity): WikidataCandidate {
  return {
    id: entity.id ?? "",
    label: labelOf(entity),
    description: descriptionOf(entity),
  };
}

/**
 * Find the Wikidata item for a name. Returns "ambiguous" rather than guessing
 * when several items are equally good matches — a wrong anchor is worse than
 * none, because it silently attaches the wrong identity to a person.
 */
export async function lookupEntity(
  name: string,
  kind: EntityKind,
): Promise<WikidataLookup> {
  const trimmed = name.trim();
  if (!trimmed) return { status: "not_found" };
  if (!isLookupWorthy(trimmed, kind)) return { status: "not_found" };
  if (missCache.has(missKey(trimmed, kind))) return { status: "not_found" };

  try {
    const search = (await getJson({
      action: "wbsearchentities",
      search: trimmed,
      language: "en",
      uselang: "en",
      type: "item",
      limit: String(SEARCH_LIMIT),
    })) as { search?: Array<{ id?: string }> };

    const ids = (search.search ?? [])
      .map((hit) => hit.id)
      .filter((id): id is string => Boolean(id));

    if (ids.length === 0) {
      missCache.add(missKey(trimmed, kind));
      return { status: "not_found" };
    }

    const entities = await fetchEntities(ids);
    const wanted = trimmed.toLowerCase();

    // Score rather than filter. Wikidata's type tree is deep and inconsistent —
    // Austria the country is not filed under any "organization" type — so the
    // right sort of thing wins on points, and how heavily documented an item is
    // stands in for how likely a newsroom means that one.
    const scored = entities
      .filter((entity) => (kind === "person" ? isHuman(entity) : !isHuman(entity)))
      .map((entity) => {
        const exact = namesOf(entity).includes(wanted);
        const plausible = isPlausible(entity, kind);
        return {
          entity,
          exact,
          plausible,
          // Being the right kind of thing counts for more than sharing a
          // string: a Python library called "anthropic" is better documented
          // than the company, but it is not who the newsroom means.
          score: claimCount(entity) * (exact ? 3 : 1) * (plausible ? 5 : 1),
        };
      })
      // An organization of an unexpected type is only worth considering when the
      // name matches exactly; otherwise the search engine's stray hits get in.
      .filter((c) => c.plausible || c.exact)
      // Wikidata often does not list the short form as an alias — nothing on
      // Q312 says "Apple" — so an exact hit ranks a candidate but does not
      // decide it. Weight of documentation decides.
      .map((c) => ({ ...c, tier: c.exact && c.plausible ? 2 : 1 }))
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      missCache.add(missKey(trimmed, kind));
      return { status: "not_found" };
    }

    // Genuine namesakes stay ambiguous; a household name beside an obscure one
    // does not, or every Trump story would need an editor's ruling. Rivals only
    // count when they match the name as squarely as the leader does — the fruit
    // does not make Apple Inc. a judgement call.
    const leader = scored[0]!;
    const runnerUp = scored[1];
    if (
      runnerUp &&
      runnerUp.tier === leader.tier &&
      leader.score < runnerUp.score * DOMINANCE_RATIO
    ) {
      return {
        status: "ambiguous",
        candidates: scored.slice(0, MAX_CANDIDATES).map((c) => toCandidate(c.entity)),
      };
    }

    const match = leader.entity;
    const description = descriptionOf(match);

    // An item with no English description tells us nothing about who this is,
    // and a QID alone is not worth the risk of having anchored to the wrong one.
    if (!description) {
      missCache.add(missKey(trimmed, kind));
      return { status: "not_found" };
    }

    // role_title only from a real office claim — never from the free-text
    // description ("American businessman" is not a title).
    let roleTitle = "";
    if (kind === "person") {
      const positionId = currentPositionId(match);
      if (positionId) {
        roleTitle = await labelFor(positionId).catch(() => "");
      }
    }

    return {
      status: "found",
      id: match.id ?? "",
      label: labelOf(match) || trimmed,
      description,
      roleTitle,
    };
  } catch (err: unknown) {
    const aborted =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      status: "error",
      message: aborted ? "Wikidata lookup timed out" : String(err),
    };
  }
}

/** Ranking for description_source; a lower rank may never overwrite a higher. */
export const DESCRIPTION_SOURCE_RANK = {
  model: 0,
  source_text: 1,
  news: 2,
  wikidata: 3,
  human: 4,
} as const;

export type DescriptionSource = keyof typeof DESCRIPTION_SOURCE_RANK;

export function isDescriptionSource(value: string): value is DescriptionSource {
  return value in DESCRIPTION_SOURCE_RANK;
}

export function canOverwrite(
  existing: string | null | undefined,
  incoming: DescriptionSource,
): boolean {
  const current =
    existing && isDescriptionSource(existing)
      ? DESCRIPTION_SOURCE_RANK[existing]
      : DESCRIPTION_SOURCE_RANK.model;
  return DESCRIPTION_SOURCE_RANK[incoming] >= current;
}

/**
 * True when role_title is just the description wearing a different hat —
 * the earlier backfill copied Wikidata descriptions into role_title.
 */
export function isRoleTitleFromDescription(
  roleTitle: string | null | undefined,
  description: string | null | undefined,
): boolean {
  const role = (roleTitle ?? "").trim().toLowerCase();
  const desc = (description ?? "").trim().toLowerCase();
  if (!role || !desc) return false;
  return role === desc || desc.includes(role) || role.includes(desc);
}
