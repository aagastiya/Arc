"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
};

/** A cluster plus the identity the generate buttons key their state off. */
type KeyedCluster = Cluster & { key: string };

const BUCKETS: StoryCategoryBucket[] = [...CANONICAL_CATEGORY_ORDER, "Other"];

type ScanResponse = {
  window_hours?: number;
  articles_scanned?: number;
  clusters?: Cluster[];
  warnings?: string[];
  error?: string;
  details?: string;
};

type ScanMeta = {
  windowHours: number;
  articlesScanned: number;
  warnings: string[];
};

/** Reader tab order, empty sections dropped, most important cluster first. */
function groupByCategory(
  clusters: Cluster[],
): Array<{ bucket: StoryCategoryBucket; clusters: KeyedCluster[] }> {
  const keyed: KeyedCluster[] = clusters.map((cluster, index) => ({
    ...cluster,
    key: `${index}:${cluster.article_ids.join(",")}`,
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

function ClusterCard({
  cluster,
  generatedId,
  busy,
  blocked,
  error,
  onGenerate,
}: {
  cluster: KeyedCluster;
  generatedId: string | undefined;
  busy: boolean;
  blocked: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <li className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              {cluster.importance}/5
            </span>
            <span className="rounded border border-[#c8ff00]/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#c8ff00]/80">
              {normalizeStoryCategory(cluster.category ?? "")}
            </span>
            <h3 className="font-medium text-zinc-100">{cluster.topic}</h3>
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
          {generatedId ? (
            <Link
              href={`/admin/${generatedId}`}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700"
            >
              Open draft
            </Link>
          ) : (
            <button
              type="button"
              onClick={onGenerate}
              disabled={busy || blocked}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate story"}
            </button>
          )}
          <span className="text-[11px] text-zinc-500">
            {cluster.article_ids.length}{" "}
            {cluster.article_ids.length === 1 ? "source" : "sources"}
          </span>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
    </li>
  );
}

export function AdminEditorPicks() {
  const [clusters, setClusters] = useState<Cluster[] | null>(null);
  const [meta, setMeta] = useState<ScanMeta | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [generatedByKey, setGeneratedByKey] = useState<Record<string, string>>({});
  const [errorByKey, setErrorByKey] = useState<Record<string, string | null>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => groupByCategory(clusters ?? []), [clusters]);
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed[g.bucket]);

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
    setErrorByKey({});
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
      setClusters(Array.isArray(data.clusters) ? data.clusters : []);
      setCollapsed({});
      setMeta({
        windowHours: data.window_hours ?? 24,
        articlesScanned: data.articles_scanned ?? 0,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      });
    } catch (err: unknown) {
      setClusters(null);
      setMeta(null);
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setIsScanning(false);
    }
  };

  const handleGenerate = async (cluster: Cluster, key: string) => {
    setGeneratingKey(key);
    setErrorByKey((prev) => ({ ...prev, [key]: null }));
    try {
      const ids = cluster.article_ids.slice(0, 5).join(",");
      const res = await fetch(
        `/api/arc/generate?id=${encodeURIComponent(ids)}&importance=${cluster.importance}`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved_story?: { id?: string };
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
      setGeneratedByKey((prev) => ({ ...prev, [key]: storyId }));
    } catch (err: unknown) {
      setErrorByKey((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Generation failed",
      }));
    } finally {
      setGeneratingKey(null);
    }
  };

  return (
    <section className="rounded-lg border border-zinc-800 bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">{"Today's picks"}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {meta
              ? `${meta.articlesScanned} articles from the last ${meta.windowHours}h · ${clusters?.length ?? 0} clusters across ${groups.length} ${groups.length === 1 ? "section" : "sections"}`
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
            {isScanning ? "Scanning…" : clusters ? "Re-scan" : "Scan"}
          </button>
        </div>
      </div>

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
          Reading recent articles and clustering…
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
              (cluster) => generatedByKey[cluster.key],
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
                    {group.clusters.length}
                    {drafted > 0 ? ` · ${drafted} drafted` : ""}
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
                        generatedId={generatedByKey[cluster.key]}
                        busy={generatingKey === cluster.key}
                        blocked={generatingKey !== null}
                        error={errorByKey[cluster.key] ?? null}
                        onGenerate={() => void handleGenerate(cluster, cluster.key)}
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
