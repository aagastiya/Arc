"use client";

import Link from "next/link";
import { useState } from "react";

type ClusterArticle = {
  id: string;
  title: string;
  source_name: string;
};

type Cluster = {
  topic: string;
  why_it_matters: string;
  importance: number;
  article_ids: string[];
  suggested_event: string;
  articles: ClusterArticle[];
  matched_event: { id: string; title: string } | null;
  proposed_event_title: string | null;
};

type ScanResponse = {
  window_hours?: number;
  articles_scanned?: number;
  clusters?: Cluster[];
  error?: string;
  details?: string;
};

type ScanMeta = {
  windowHours: number;
  articlesScanned: number;
};

function suggestedEventLabel(cluster: Cluster): string {
  if (cluster.matched_event) {
    return `Matches: ${cluster.matched_event.title}`;
  }
  if (cluster.proposed_event_title) {
    return `Proposes: ${cluster.proposed_event_title}`;
  }
  return "No event";
}

export function AdminEditorPicks() {
  const [clusters, setClusters] = useState<Cluster[] | null>(null);
  const [meta, setMeta] = useState<ScanMeta | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [generatedByKey, setGeneratedByKey] = useState<Record<string, string>>({});
  const [errorByKey, setErrorByKey] = useState<Record<string, string | null>>({});

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
      setMeta({
        windowHours: data.window_hours ?? 24,
        articlesScanned: data.articles_scanned ?? 0,
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
              ? `${meta.articlesScanned} articles from the last ${meta.windowHours}h`
              : "Cluster and rank recent articles before drafting."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleScan()}
          disabled={isScanning}
          className="rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isScanning ? "Scanning…" : clusters ? "Re-scan" : "Scan"}
        </button>
      </div>

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

      {clusters && clusters.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {clusters.map((cluster, index) => {
            const key = `${index}:${cluster.article_ids.join(",")}`;
            const generatedId = generatedByKey[key];
            const busy = generatingKey === key;
            return (
              <li
                key={key}
                className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                        {cluster.importance}/5
                      </span>
                      <h3 className="font-medium text-zinc-100">
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
                        onClick={() => void handleGenerate(cluster, key)}
                        disabled={busy || generatingKey !== null}
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

                {errorByKey[key] ? (
                  <p className="mt-3 text-sm text-red-400">{errorByKey[key]}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
