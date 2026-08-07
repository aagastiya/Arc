/**
 * When a section has more articles than the model budget, keep multi-outlet
 * keyword groups intact and drop loners first — never carve a shared-story
 * group down to a single survivor by naive recency truncation.
 */

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "as",
  "by",
  "with",
  "from",
  "into",
  "over",
  "after",
  "before",
  "about",
  "against",
  "between",
  "through",
  "during",
  "without",
  "within",
  "along",
  "across",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "not",
  "no",
  "nor",
  "so",
  "if",
  "then",
  "than",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "his",
  "her",
  "their",
  "our",
  "your",
  "new",
  "says",
  "said",
  "say",
  "amid",
  "amidst",
  "near",
  "how",
  "why",
  "what",
  "when",
  "where",
  "who",
  "whom",
  "which",
  "while",
  "still",
  "just",
  "also",
  "more",
  "most",
  "some",
  "any",
  "all",
  "out",
  "up",
  "down",
  "off",
  "again",
  "further",
  "once",
  "here",
  "there",
  "us",
  "uk",
  "smart",
  "best",
  "ranking",
  "reportedly",
  "between",
  "could",
  "would",
  "makes",
  "make",
  "takes",
  "take",
  "gets",
  "get",
  "back",
  "ahead",
  "under",
  "against",
  "trump",
  "biden",
  "obama",
  "president",
  "presidential",
  "congress",
  "congressional",
  "senate",
  "senator",
  "house",
  "committee",
  "white",
  "administration",
  "officials",
  "official",
  "government",
  "federal",
  "state",
  "american",
  "america",
  "reuters",
  "report",
  "reports",
  "reported",
  "according",
  "latest",
  "update",
  "updates",
  "breaking",
  "live",
  "news",
  "video",
  "watch",
  "year",
  "years",
  "week",
  "weeks",
  "today",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "iran",
  "iranian",
  "israel",
  "israeli",
  "china",
  "chinese",
  "russia",
  "russian",
  "ukraine",
  "ukrainian",
  "justice",
  "department",
  "panel",
  "votes",
  "vote",
  "hold",
  "held",
  "asks",
  "ask",
  "made",
  "first",
  "next",
  "happens",
  "huge",
  "mistake",
  "faces",
  "face",
  "deal",
  "close",
  "aims",
  "ban",
  "stocks",
  "stock",
  "shares",
  "markets",
  "market",
  "prices",
  "price",
  "investing",
  "investor",
  "investors",
  "nuclear",
  "solar",
  "optical",
  "memory",
  "themes",
  "highlights",
  "brief",
  "pulse",
  "promo",
  "promos",
  "codes",
  "code",
  "discount",
  "discounts",
  "percent",
  "august",
  "september",
  "october",
]);

/** Keywords appearing in more titles than this are too generic to link on. */
const MAX_KEYWORD_DOC_FREQ = 40;

export type SelectableArticle = {
  id: string;
  title: string;
  published_at: string | null;
};

/** Significant title tokens used to detect multi-outlet overlap. */
export function significantTitleKeywords(title: string): string[] {
  const raw = title
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((t) =>
      t
        .replace(/^['\u2019]+|['\u2019]+$/g, "")
        // OpenAI's / Fauci's → openai / fauci so possessives still match.
        .replace(/['\u2019]s$/i, ""),
    )
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  return [...new Set(raw)];
}

function publishedMs(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function groupNewest(group: SelectableArticle[]): number {
  return Math.max(0, ...group.map((a) => publishedMs(a.published_at)));
}

/**
 * Prefer multi-outlet keyword cohorts over loners when cutting to budget.
 *
 * Groups are per significant keyword (not transitive union-find): a shared
 * token like "fauci" keeps that cohort intact without gluing it to every
 * other "justice department" story in the section.
 */
export function selectOverlapPreserving<T extends SelectableArticle>(
  articles: T[],
  budget: number,
): T[] {
  if (articles.length <= budget) return articles;
  if (budget <= 0) return [];

  const byId = new Map(articles.map((a) => [a.id, a]));
  const inverted = new Map<string, string[]>();
  for (const article of articles) {
    for (const kw of significantTitleKeywords(article.title)) {
      const list = inverted.get(kw) ?? [];
      list.push(article.id);
      inverted.set(kw, list);
    }
  }

  const keywordGroups: T[][] = [];
  for (const ids of inverted.values()) {
    if (ids.length < 2 || ids.length > MAX_KEYWORD_DOC_FREQ) continue;
    const group = [...new Set(ids)]
      .map((id) => byId.get(id)!)
      .filter(Boolean);
    if (group.length >= 2) keywordGroups.push(group);
  }

  keywordGroups.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return groupNewest(b) - groupNewest(a);
  });

  const selected: T[] = [];
  const selectedIds = new Set<string>();

  const take = (article: T) => {
    if (selected.length >= budget) return false;
    if (selectedIds.has(article.id)) return false;
    selected.push(article);
    selectedIds.add(article.id);
    return true;
  };

  for (const group of keywordGroups) {
    if (selected.length >= budget) break;
    const ordered = [...group].sort(
      (a, b) => publishedMs(b.published_at) - publishedMs(a.published_at),
    );
    const missing = ordered.filter((a) => !selectedIds.has(a.id));
    if (missing.length === 0) continue;

    // Keep the cohort intact when it fits; otherwise take the newest members
    // of this keyword group before moving on to loners.
    const room = budget - selected.length;
    for (const article of missing.slice(0, room)) take(article);
  }

  const loners = articles
    .filter((a) => !selectedIds.has(a.id))
    .sort((a, b) => publishedMs(b.published_at) - publishedMs(a.published_at));
  for (const article of loners) {
    if (selected.length >= budget) break;
    take(article);
  }

  return selected.sort(
    (a, b) => publishedMs(b.published_at) - publishedMs(a.published_at),
  );
}

/**
 * If the model under-covered a dense multi-outlet cohort still sitting in the
 * input (e.g. 8+ Fauci headlines), mint a cluster for the unused members so
 * heavy coverage cannot vanish into singles elsewhere or disappear entirely.
 */
export function unusedMultiOutletCohorts<T extends SelectableArticle>(
  articles: T[],
  usedIds: Set<string>,
  minSize = 3,
): T[][] {
  const unused = articles.filter((a) => !usedIds.has(a.id));
  if (unused.length < minSize) return [];

  const byId = new Map(unused.map((a) => [a.id, a]));
  const inverted = new Map<string, string[]>();
  for (const article of unused) {
    for (const kw of significantTitleKeywords(article.title)) {
      const list = inverted.get(kw) ?? [];
      list.push(article.id);
      inverted.set(kw, list);
    }
  }

  const cohorts: T[][] = [];
  const claimed = new Set<string>();
  const ranked = [...inverted.entries()]
    .map(([kw, ids]) => ({
      kw,
      ids: [...new Set(ids)].filter((id) => byId.has(id) && !claimed.has(id)),
    }))
    .filter(
      (g) =>
        g.ids.length >= minSize &&
        g.ids.length <= MAX_KEYWORD_DOC_FREQ &&
        g.kw.length >= 5,
    )
    .sort((a, b) => b.ids.length - a.ids.length);

  for (const group of ranked) {
    const members = group.ids
      .filter((id) => !claimed.has(id))
      .map((id) => byId.get(id)!);
    if (members.length < minSize) continue;
    // Mint only coherent cohorts — keyword hit alone can still be a brand collision.
    const parts = splitIncoherentGroup(members);
    let coherent = parts.filter((g) => g.length >= minSize);
    const small = parts.filter((g) => g.length < minSize).flat();
    if (coherent.length === 1 && small.length > 0 && members.length <= 16) {
      const core = coherent[0]!;
      const orphanParts = splitIncoherentGroup(small);
      const loneOrphans = orphanParts.filter((g) => g.length === 1).flat();
      const attachable = loneOrphans.filter((o) => {
        const ok = significantTitleKeywords(o.title);
        return ok.includes(group.kw) && members.length <= 12;
      });
      if (attachable.length > 0) core.push(...attachable);
    }
    if (coherent.length === 0) continue;
    for (const g of coherent) {
      for (const m of g) claimed.add(m.id);
      cohorts.push(
        g.sort(
          (a, b) => publishedMs(b.published_at) - publishedMs(a.published_at),
        ),
      );
    }
  }

  return cohorts;
}

/**
 * Pull articles that share a dense distinctive keyword into coherent clusters
 * when the model left them scattered or partly unused. After gathering by
 * keyword, splitIncoherentGroup keeps different events that share a brand
 * name (e.g. OpenAI speaker vs ChatGPT limits) from collapsing into one blob.
 */
export function consolidateByDenseKeywords<T extends SelectableArticle>(
  articles: T[],
  clusters: Array<{
    topic: string;
    article_ids: string[];
    importance: number;
  }>,
  opts: { minSize?: number; maxPerCluster?: number } = {},
): {
  keyword: string;
  groups: T[][];
  seedTopic: string;
  importance: number;
}[] {
  const minSize = opts.minSize ?? 3;
  const maxPerCluster = opts.maxPerCluster ?? 14;
  const byId = new Map(articles.map((a) => [a.id, a]));

  const inverted = new Map<string, string[]>();
  for (const article of articles) {
    for (const kw of significantTitleKeywords(article.title)) {
      if (kw.length < 5) continue;
      const list = inverted.get(kw) ?? [];
      list.push(article.id);
      inverted.set(kw, list);
    }
  }

  const articleToCluster = new Map<string, number>();
  clusters.forEach((c, i) => {
    for (const id of c.article_ids) articleToCluster.set(id, i);
  });

  const merges: {
    keyword: string;
    groups: T[][];
    seedTopic: string;
    importance: number;
  }[] = [];
  const claimed = new Set<string>();

  const ranked = [...inverted.entries()]
    .map(([kw, ids]) => ({
      kw,
      ids: [...new Set(ids)].filter((id) => byId.has(id)),
    }))
    .filter(
      (g) =>
        g.ids.length >= minSize &&
        g.ids.length <= MAX_KEYWORD_DOC_FREQ,
    )
    .sort((a, b) => b.ids.length - a.ids.length);

  for (const group of ranked) {
    const free = group.ids.filter((id) => !claimed.has(id));
    if (free.length < minSize) continue;

    const clusterIdxs = new Set(
      free
        .map((id) => articleToCluster.get(id))
        .filter((i): i is number => i !== undefined),
    );
    const unusedCount = free.filter((id) => !articleToCluster.has(id)).length;
    const singletonFragments = [...clusterIdxs].filter(
      (i) => (clusters[i]?.article_ids.length ?? 0) <= 2,
    ).length;
    const scattered =
      unusedCount +
      free.filter((id) => {
        const idx = articleToCluster.get(id);
        return idx !== undefined && (clusters[idx]?.article_ids.length ?? 0) <= 2;
      }).length;
    // Skip only when the keyword is already one solid cluster with nothing left out.
    if (clusterIdxs.size <= 1 && scattered < 2) continue;
    if (clusterIdxs.size === 0 && unusedCount < minSize) continue;

    const members = free
      .map((id) => byId.get(id)!)
      .sort((a, b) => publishedMs(b.published_at) - publishedMs(a.published_at));

    const coherentParts = splitIncoherentGroup(members).map((g) =>
      g.sort(
        (a, b) => publishedMs(b.published_at) - publishedMs(a.published_at),
      ),
    );
    let large = coherentParts
      .filter((g) => g.length >= minSize)
      .map((g) => g.slice(0, maxPerCluster));
    const orphans = coherentParts.filter((g) => g.length < minSize).flat();

    // Rare event anchors (hormuz, fauci): attach singleton orphans that still
    // share the dense keyword. Leave rival multi-article orphan groups alone
    // (OpenAI speaker core must not absorb the ChatGPT pair).
    if (large.length === 1 && orphans.length > 0 && free.length <= 16) {
      const core = large[0]!;
      const orphanParts = splitIncoherentGroup(orphans);
      const loneOrphans = orphanParts.filter((g) => g.length === 1).flat();
      const attachable = loneOrphans.filter((o) => {
        const ok = significantTitleKeywords(o.title);
        if (!ok.includes(group.kw)) return false;
        // Prefer orphans that also look related to the core; for very rare
        // anchors, the dense keyword alone is enough.
        if (free.length <= 12) return true;
        const oSet = new Set(ok);
        const coreKws = core.map((a) => new Set(significantTitleKeywords(a.title)));
        let hits = 0;
        for (const ck of coreKws) {
          const shared = [...oSet].filter((k) => ck.has(k));
          if (shared.length >= 2 || jaccard(oSet, ck) >= 0.22) hits += 1;
        }
        return hits >= Math.ceil(core.length / 2);
      });
      const room = maxPerCluster - core.length;
      if (room > 0 && attachable.length > 0) {
        core.push(...attachable.slice(0, room));
      }
    }

    const coherent = large.filter((g) => g.length >= minSize);
    if (coherent.length === 0) continue;

    let seedTopic = members[0]!.title;
    let importance = 3;
    if (clusterIdxs.size > 0) {
      const best = [...clusterIdxs]
        .map((i) => clusters[i]!)
        .sort((a, b) => b.article_ids.length - a.article_ids.length)[0]!;
      seedTopic = best.topic;
      importance = Math.max(importance, best.importance);
    }

    for (const g of coherent) {
      for (const m of g) claimed.add(m.id);
    }
    merges.push({
      keyword: group.kw,
      groups: coherent,
      seedTopic,
      importance: Math.min(5, importance),
    });
  }

  return merges;
}

export function clusterSizeDistribution(
  sizes: number[],
): { one: number; two: number; threePlus: number } {
  let one = 0;
  let two = 0;
  let threePlus = 0;
  for (const n of sizes) {
    if (n <= 1) one += 1;
    else if (n === 2) two += 1;
    else threePlus += 1;
  }
  return { one, two, threePlus };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/**
 * Split a model cluster that glued unrelated stories (e.g. "Chuck Todd" into
 * "Todd Blanche"). Members stay together only when they share enough title
 * signal; weak attachments become their own 1-article clusters upstream.
 */
export function splitIncoherentGroup<T extends SelectableArticle>(
  members: T[],
): T[][] {
  if (members.length <= 1) return [members];

  const kws = members.map(
    (m) => new Set(significantTitleKeywords(m.title)),
  );
  const parent = members.map((_, i) => i);
  const find = (i: number): number => {
    let cur = i;
    while (parent[cur] !== cur) {
      parent[cur] = parent[parent[cur]!]!;
      cur = parent[cur]!;
    }
    return cur;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const shared = [...kws[i]!].filter((k) => kws[j]!.has(k));
      // A single shared brand/token is not enough — "OpenAI speaker" ≠ "ChatGPT limits".
      const related =
        shared.length >= 2 || jaccard(kws[i]!, kws[j]!) >= 0.22;
      if (related) union(i, j);
    }
  }

  const groups = new Map<number, T[]>();
  for (let i = 0; i < members.length; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(members[i]!);
    groups.set(root, list);
  }
  return [...groups.values()];
}
