"use client";

import { useEffect, useMemo, useState } from "react";

import {
  CANONICAL_CATEGORY_ORDER,
  normalizeStoryCategory,
  type StoryCategoryBucket,
} from "@/lib/categories";

type ClusterArticle = {
  id: string;
  title: string;
  source_name: string;
};

type ExistingStory = {
  id: string;
  headline: string;
  importance: number | null;
  flags: number | null;
};

type Cluster = {
  topic: string;
  why_it_matters: string;
  importance: number;
  category?: string;
  article_ids: string[];
  suggested_event: string;
  articles: ClusterArticle[];
  matched_event: { id: string; title: string } | null;
  proposed_event_title: string | null;
  existing_story?: ExistingStory | null;
};

/** A cluster plus the identity its state is keyed by, stable across restores. */
type KeyedCluster = Cluster & { key: string };

type CardState =
  | { status: "pending" }
  | { status: "generating" }
  | {
      status: "done";
      storyId: string;
      headline: string;
      importance: number;
      flags: number | null;
    }
  | { status: "failed"; error: string };

type ScanMeta = {
  windowHours: number;
  articlesScanned: number;
  warnings: string[];
};

type ScanResponse = {
  window_hours?: number;
  articles_scanned?: number;
  clusters?: Cluster[];
  warnings?: string[];
  error?: string;
  details?: string;
};

/** Survives navigation and a closed tab so a long drafting session isn't lost. */
type PersistedScan = {
  version: 2;
  savedAt: number;
  clusters: Cluster[];
  meta: ScanMeta;
  states: Record<string, CardState>;
  collapsed: Record<string, boolean>;
};

const STORAGE_KEY = "arc.editor.scan.v2";

/** Yesterday's picks are not today's paper; past this age, scan again. */
const MAX_RESTORE_AGE_MS = 12 * 60 * 60 * 1000;
const BUCKETS: StoryCategoryBucket[] = [...CANONICAL_CATEGORY_ORDER, "Other"];

/** Article ids identify a pick; the model's ordering of them must not matter. */
function clusterKey(cluster: Cluster): string {
  return `${normalizeStoryCategory(cluster.category ?? "")}:${[...cluster.article_ids]
    .sort()
    .join(",")}`;
}

function readPersisted(): PersistedScan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedScan;
    if (parsed?.version !== 2 || !Array.isArray(parsed.clusters)) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > MAX_RESTORE_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(payload: Omit<PersistedScan, "savedAt"> | null): void {
  if (typeof window === "undefined") return;
  try {
    if (payload) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...payload, savedAt: Date.now() }),
      );
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Full or blocked storage costs persistence, not the session.
  }
}

/** A pick already drafted starts out done, so it can never be drafted twice. */
function initialStates(clusters: Cluster[]): Record<string, CardState> {
  const states: Record<string, CardState> = {};
  for (const cluster of clusters) {
    const existing = cluster.existing_story;
    if (existing) {
      states[clusterKey(cluster)] = {
        status: "done",
        storyId: existing.id,
        headline: existing.headline,
        importance: existing.importance ?? cluster.importance,
        flags: existing.flags,
      };
    }
  }
  return states;
}

/** Reader tab order, empty sections dropped, most important pick first. */
function groupByCategory(
  clusters: Cluster[],
): Array<{ bucket: StoryCategoryBucket; clusters: KeyedCluster[] }> {
  const keyed: KeyedCluster[] = clusters.map((cluster) => ({
    ...cluster,
    key: clusterKey(cluster),
  }));

  return BUCKETS.map((bucket) => ({
    bucket,
    clusters: keyed
      .filter((cluster) => normalizeStoryCategory(cluster.category ?? "") === bucket)
      .sort((a, b) => b.importance - a.importance),
  })).filter((group) => group.clusters.length > 0);
}

function suggestedEventLabel(cluster: Cluster): string {
  if (cluster.matched_event) {
    return `Matches: ${cluster.matched_event.title}`;
  }
  if (cluster.proposed_event_title) {
    return `Proposes: ${cluster.proposed_event_title}`;
  }
  return "No event";
}

function VerificationBadge({ flags }: { flags: number | null }) {
  if (flags === null) {
    return <span className="text-[11px] text-zinc-500">Not verified</span>;
  }
  if (flags === 0) {
    return (
      <span className="rounded border border-[#c8ff00]/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#c8ff00]">
        Verified · no flags
      </span>
    );
  }
  return (
    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
      {flags} {flags === 1 ? "flag" : "flags"}
    </span>
  );
}

function DonePanel({
  state,
}: {
  state: Extract<CardState, { status: "done" }>;
}) {
  return (
    <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-sm font-medium leading-6 text-zinc-100">
        {state.headline}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <VerificationBadge flags={state.flags} />
        <span className="text-[11px] text-zinc-500">
          Importance {state.importance}/5
        </span>
        <a
          href={`/admin/${state.storyId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium text-[#c8ff00] hover:underline"
        >
          Review ↗
        </a>
      </div>
    </div>
  );
}

function ClusterCard({
  cluster,
  state,
  onGenerate,
}: {
  cluster: KeyedCluster;
  state: CardState;
  onGenerate: () => void;
}) {
  const done = state.status === "done";

  return (
    <li
      className={`rounded-md border p-4 ${
        done
          ? "border-zinc-800 bg-zinc-900/20"
          : "border-zinc-800 bg-zinc-900/40"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              {cluster.importance}/5
            </span>
            <span className="rounded border border-[#c8ff00]/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#c8ff00]/80">
              {normalizeStoryCategory(cluster.category ?? "")}
            </span>
            <h3
              className={`font-medium ${done ? "text-zinc-400" : "text-zinc-100"}`}
            >
              {cluster.topic}
            </h3>
          </div>

          {cluster.why_it_matters ? (
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {cluster.why_it_matters}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {cluster.articles.map((article) => (
              <span
                key={article.id}
                title={article.title}
                className="rounded border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400"
              >
                {article.source_name}
              </span>
            ))}
            <span className="text-[11px] text-zinc-500">
              {suggestedEventLabel(cluster)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {state.status === "done" ? (
            <span className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-500">
              Drafted
            </span>
          ) : (
            <button
              type="button"
              onClick={onGenerate}
              disabled={state.status === "generating"}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.status === "generating"
                ? "Generating…"
                : state.status === "failed"
                  ? "Retry"
                  : "Generate story"}
            </button>
          )}
          <span className="text-[11px] text-zinc-500">
            {cluster.article_ids.length}{" "}
            {cluster.article_ids.length === 1 ? "source" : "sources"}
          </span>
        </div>
      </div>

      {state.status === "generating" ? (
        <p className="mt-3 text-xs text-zinc-500">
          Writing the story, extracting the graph, and fact-checking it…
        </p>
      ) : null}

      {state.status === "done" ? <DonePanel state={state} /> : null}

      {state.status === "failed" ? (
        <p className="mt-3 text-sm text-red-400">{state.error}</p>
      ) : null}
    </li>
  );
}

export function AdminEditorPicks() {
  const [clusters, setClusters] = useState<Cluster[] | null>(null);
  const [meta, setMeta] = useState<ScanMeta | null>(null);
  const [states, setStates] = useState<Record<string, CardState>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // Storage is unreachable during the server render, so the last scan is read
  // after mount rather than as initial state.
  useEffect(() => {
    const saved = readPersisted();
    if (saved) {
      setClusters(saved.clusters);
      setMeta(saved.meta);
      setStates(saved.states ?? {});
      setCollapsed(saved.collapsed ?? {});
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    if (!clusters || !meta) {
      writePersisted(null);
      return;
    }
    writePersisted({ version: 2, clusters, meta, states, collapsed });
  }, [restored, clusters, meta, states, collapsed]);

  const groups = useMemo(() => groupByCategory(clusters ?? []), [clusters]);
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed[g.bucket]);
  const total = clusters?.length ?? 0;
  const generated = useMemo(
    () =>
      groups.reduce(
        (sum, group) =>
          sum +
          group.clusters.filter((c) => states[c.key]?.status === "done").length,
        0,
      ),
    [groups, states],
  );

  const toggleAll = () => {
    setCollapsed(
      allCollapsed
        ? {}
        : Object.fromEntries(groups.map((group) => [group.bucket, true])),
    );
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/admin/editor/scan", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as ScanResponse;
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Scan failed",
        );
      }
      const found = Array.isArray(data.clusters) ? data.clusters : [];
      setClusters(found);
      setStates(initialStates(found));
      setCollapsed({});
      setMeta({
        windowHours: data.window_hours ?? 24,
        articlesScanned: data.articles_scanned ?? 0,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      });
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setIsScanning(false);
    }
  };

  const handleGenerate = async (cluster: KeyedCluster) => {
    setStates((prev) => ({ ...prev, [cluster.key]: { status: "generating" } }));
    try {
      const ids = cluster.article_ids.slice(0, 5).join(",");
      const res = await fetch(
        `/api/arc/generate?id=${encodeURIComponent(ids)}&importance=${cluster.importance}`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved_story?: { id?: string; arc_headline?: string; importance?: number };
        verification?: { flags?: unknown[] } | null;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Generation failed",
        );
      }
      const storyId = data.saved_story?.id;
      if (!storyId) {
        throw new Error("Story created, but no story id was returned.");
      }

      setStates((prev) => ({
        ...prev,
        [cluster.key]: {
          status: "done",
          storyId,
          headline: data.saved_story?.arc_headline ?? cluster.topic,
          importance: data.saved_story?.importance ?? cluster.importance,
          flags: Array.isArray(data.verification?.flags)
            ? data.verification.flags.length
            : null,
        },
      }));
    } catch (err: unknown) {
      setStates((prev) => ({
        ...prev,
        [cluster.key]: {
          status: "failed",
          error: err instanceof Error ? err.message : "Generation failed",
        },
      }));
    }
  };

  return (
    <section className="rounded-lg border border-zinc-800 bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">{"Today's picks"}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {meta
              ? `${meta.articlesScanned} articles from the last ${meta.windowHours}h · ${total} picks across ${groups.length} ${groups.length === 1 ? "section" : "sections"}`
              : "Cluster and rank recent articles before drafting."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {groups.length > 1 ? (
            <button
              type="button"
              onClick={toggleAll}
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-100"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleScan()}
            disabled={isScanning}
            className="rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isScanning ? "Scanning…" : clusters ? "Rescan" : "Scan"}
          </button>
        </div>
      </div>

      {total > 0 ? (
        <div className="mt-4">
          <p className="text-xs text-zinc-400">
            {generated} of {total} picks generated
          </p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${total === 0 ? 0 : (generated / total) * 100}%`,
                backgroundColor: "#c8ff00",
              }}
            />
          </div>
        </div>
      ) : null}

      {meta?.warnings.length ? (
        <p className="mt-3 text-xs text-amber-400">
          {meta.warnings.length} {meta.warnings.length === 1 ? "section" : "sections"}{" "}
          failed to cluster: {meta.warnings.join("; ")}
        </p>
      ) : null}

      {scanError ? (
        <p className="mt-4 text-sm text-red-400">{scanError}</p>
      ) : null}

      {isScanning ? (
        <p className="mt-4 text-sm text-zinc-500">
          Reading recent articles and clustering each section…
        </p>
      ) : null}

      {clusters && clusters.length === 0 && !isScanning ? (
        <p className="mt-4 text-sm text-zinc-500">
          No clusters worth drafting right now.
        </p>
      ) : null}

      {groups.length > 0 ? (
        <div className="mt-6 space-y-7">
          {groups.map((group) => {
            const isCollapsed = Boolean(collapsed[group.bucket]);
            const drafted = group.clusters.filter(
              (cluster) => states[cluster.key]?.status === "done",
            ).length;

            return (
              <section key={group.bucket}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => ({
                      ...prev,
                      [group.bucket]: !isCollapsed,
                    }))
                  }
                  aria-expanded={!isCollapsed}
                  className="mb-2 flex w-full items-center gap-2 text-left"
                >
                  <span
                    className="h-0.5 w-6 shrink-0 rounded-full"
                    style={{ backgroundColor: "#c8ff00" }}
                    aria-hidden
                  />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-300">
                    {group.bucket}
                  </h3>
                  <span className="text-[11px] text-zinc-500">
                    {drafted} / {group.clusters.length} drafted
                  </span>
                  <span className="text-[11px] text-zinc-600" aria-hidden>
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                </button>

                {isCollapsed ? null : (
                  <ul className="space-y-3">
                    {group.clusters.map((cluster) => (
                      <ClusterCard
                        key={cluster.key}
                        cluster={cluster}
                        state={states[cluster.key] ?? { status: "pending" }}
                        onGenerate={() => void handleGenerate(cluster)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
