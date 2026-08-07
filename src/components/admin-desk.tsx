"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  ReviewDraftCard,
  type ReviewStory,
} from "@/components/admin-genre-review";
import { SyncNewsButton } from "@/components/sync-news-button";
import {
  isPublishableVerification,
  type Verification,
} from "@/lib/arc/verification";
import type {
  DeskCluster,
  DeskGenre,
  DeskLiveStory,
} from "@/lib/admin/desk-data";
import { DESK_TARGET_PER_GENRE } from "@/lib/admin/desk-data";
import {
  CANONICAL_CATEGORY_ORDER,
  normalizeStoryCategory,
  type StoryCategoryBucket,
} from "@/lib/categories";
import { isStaleSource } from "@/lib/story-dates";
import {
  capArticleIds,
  selectGenerateArticleIds,
} from "@/lib/arc/select-generate-articles";

const SCAN_STALE_MS = 6 * 60 * 60 * 1000;

type ClusterState =
  | { status: "pending" }
  | { status: "generating" }
  | { status: "failed"; error: string }
  | { status: "done"; storyId: string };

type PublishResult =
  | { id: string; ok: true; headline: string }
  | { id: string; ok: false; headline: string; error: string };

function clusterKey(cluster: DeskCluster): string {
  return `${normalizeStoryCategory(cluster.category)}:${[...cluster.article_ids]
    .sort()
    .join(",")}`;
}

function ClusterCard({
  cluster,
  state,
  expanded,
  onToggle,
  onGenerate,
}: {
  cluster: DeskCluster;
  state: ClusterState;
  expanded: boolean;
  onToggle: () => void;
  onGenerate: () => void;
}) {
  const sourceCount = cluster.source_count || cluster.article_ids.length;
  const outlets = [
    ...new Set(cluster.articles.map((a) => a.source_name).filter(Boolean)),
  ];

  return (
    <article className="rounded-md border border-zinc-800/90 bg-zinc-950/40">
      <div className="flex items-start gap-3 p-3.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              {cluster.importance}/5
            </span>
            {sourceCount === 1 ? (
              <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                1 source
              </span>
            ) : (
              <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                {sourceCount} sources
              </span>
            )}
            <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
              Cluster
            </span>
          </div>
          <h3 className="mt-1.5 text-[15px] font-medium leading-snug text-zinc-100">
            {cluster.topic}
          </h3>
          {cluster.why_it_matters ? (
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">
              {cluster.why_it_matters}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1">
            {outlets.slice(0, 8).map((name) => (
              <span
                key={name}
                className="rounded border border-zinc-800 bg-zinc-900/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500"
              >
                {name}
              </span>
            ))}
            {outlets.length > 8 ? (
              <span className="text-[10px] text-zinc-600">
                +{outlets.length - 8}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-600">
            {expanded ? "Hide articles" : "Show articles"}
          </p>
        </button>

        <button
          type="button"
          onClick={onGenerate}
          disabled={state.status === "generating" || state.status === "done"}
          className="shrink-0 rounded-full bg-[#c8ff00] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state.status === "generating"
            ? "Generating…"
            : state.status === "failed"
              ? "Retry"
              : state.status === "done"
                ? "Drafted"
                : "Generate"}
        </button>
      </div>

      {state.status === "failed" ? (
        <p className="border-t border-zinc-900 px-3.5 py-2 text-sm text-red-400">
          {state.error}
        </p>
      ) : null}

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <ul className="space-y-2 border-t border-zinc-900 px-3.5 py-3">
            {cluster.articles.map((article) => (
              <li key={article.id} className="text-sm leading-snug">
                <span className="text-zinc-500">{article.source_name}</span>
                <span className="text-zinc-600"> · </span>
                <span className="text-zinc-300">{article.title}</span>
                {article.published_at ? (
                  <span className="ml-2 text-[11px] text-zinc-600">
                    {new Date(article.published_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "UTC",
                    })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

function LiveStrip({
  stories,
  count,
}: {
  stories: DeskLiveStory[];
  count: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-md border border-zinc-900 bg-zinc-950/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Live today — {count}
        </span>
        <span className="text-[11px] text-zinc-600">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        stories.length === 0 ? (
          <p className="border-t border-zinc-900 px-3.5 py-3 text-sm text-zinc-600">
            Nothing live in this section yet today.
          </p>
        ) : (
          <ul className="space-y-1.5 border-t border-zinc-900 px-3.5 py-3">
            {stories.map((story) => (
              <li key={story.id} className="flex items-baseline gap-2 text-sm">
                <span className="text-[10px] text-zinc-600">
                  {story.importance}/5
                </span>
                <Link
                  href={`/admin/${story.id}`}
                  className="text-zinc-300 hover:text-zinc-100"
                >
                  {story.headline}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}

export function AdminDesk({
  editionLabel,
  totalLiveToday,
  genres: initialGenres,
  initialClusters,
  scanCachedAt,
  initialGenre,
}: {
  editionLabel: string;
  totalLiveToday: number;
  genres: DeskGenre[];
  initialClusters: DeskCluster[];
  scanCachedAt: string | null;
  initialGenre?: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const firstWithWork =
    initialGenres.find(
      (g) =>
        g.drafts.length > 0 ||
        initialClusters.some(
          (c) =>
            normalizeStoryCategory(c.category) === g.bucket && !c.existing_story,
        ),
    )?.slug ?? initialGenres[0]?.slug ?? "world";

  const [activeSlug, setActiveSlug] = useState(
    initialGenre && initialGenres.some((g) => g.slug === initialGenre)
      ? initialGenre
      : firstWithWork,
  );
  const [genres, setGenres] = useState(initialGenres);
  const [clusters, setClusters] = useState(initialClusters);
  const [clusterStates, setClusterStates] = useState<Record<string, ClusterState>>(
    {},
  );
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedDrafts, setExpandedDrafts] = useState<Record<string, boolean>>(
    {},
  );
  const [included, setIncluded] = useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const g of initialGenres) {
      for (const s of g.drafts) {
        next[s.id] =
          isPublishableVerification(s.verification) &&
          !isStaleSource(s.newest_source_at);
      }
    }
    return next;
  });
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const [archiving, setArchiving] = useState<Record<string, boolean>>({});
  const [scanning, setScanning] = useState<"all" | string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState(scanCachedAt);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(
    null,
  );

  useEffect(() => {
    setGenres(initialGenres);
    setClusters(initialClusters);
    setCachedAt(scanCachedAt);
  }, [initialGenres, initialClusters, scanCachedAt]);

  // Morning / stale cache: quietly refresh each genre in the background.
  useEffect(() => {
    const stale =
      !scanCachedAt ||
      Date.now() - new Date(scanCachedAt).getTime() > SCAN_STALE_MS ||
      Number.isNaN(new Date(scanCachedAt).getTime());
    if (!stale) return;

    let cancelled = false;
    const buckets = CANONICAL_CATEGORY_ORDER.filter((bucket) =>
      initialGenres.some((g) => g.bucket === bucket),
    );

    void (async () => {
      for (const bucket of buckets) {
        if (cancelled) return;
        try {
          const res = await fetch("/api/admin/editor/scan", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category: bucket }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            clusters?: DeskCluster[];
            cached_at?: string;
          };
          if (!res.ok || cancelled) continue;
          const found = Array.isArray(data.clusters) ? data.clusters : [];
          setClusters((prev) => [
            ...prev.filter(
              (c) => normalizeStoryCategory(c.category) !== bucket,
            ),
            ...found,
          ]);
          if (data.cached_at) setCachedAt(data.cached_at);
        } catch {
          // Background refresh is best-effort.
        }
      }
      if (!cancelled) {
        startTransition(() => router.refresh());
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only on mount / when the server-reported cache timestamp changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanCachedAt]);

  const active = genres.find((g) => g.slug === activeSlug) ?? genres[0]!;
  const doneKeys = useMemo(
    () =>
      new Set(
        Object.entries(clusterStates)
          .filter(([, s]) => s.status === "done")
          .map(([k]) => k),
      ),
    [clusterStates],
  );

  const draftArticleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of active.drafts) {
      for (const id of d.article_ids) ids.add(id);
      ids.add(d.article_id);
    }
    return ids;
  }, [active.drafts]);

  const pendingClusters = useMemo(() => {
    return clusters
      .filter((c) => normalizeStoryCategory(c.category) === active.bucket)
      .filter((c) => !c.existing_story)
      .filter((c) => !c.article_ids.some((id) => draftArticleIds.has(id)))
      .filter((c) => !doneKeys.has(clusterKey(c)))
      .sort((a, b) => {
        if (b.importance !== a.importance) return b.importance - a.importance;
        return (b.source_count ?? 0) - (a.source_count ?? 0);
      });
  }, [clusters, active.bucket, draftArticleIds, doneKeys]);

  const publishedIds = useMemo(
    () => new Set((publishResults ?? []).filter((r) => r.ok).map((r) => r.id)),
    [publishResults],
  );
  const remainingDrafts = active.drafts.filter((s) => !publishedIds.has(s.id));
  const includedIds = remainingDrafts
    .filter(
      (s) => included[s.id] && isPublishableVerification(s.verification),
    )
    .map((s) => s.id);

  const workspaceItems = useMemo(() => {
    type Item =
      | { kind: "cluster"; key: string; importance: number; cluster: DeskCluster }
      | { kind: "draft"; key: string; importance: number; story: ReviewStory };
    const items: Item[] = [
      ...pendingClusters.map((cluster) => ({
        kind: "cluster" as const,
        key: `c:${clusterKey(cluster)}`,
        importance: cluster.importance,
        cluster,
      })),
      ...remainingDrafts.map((story) => ({
        kind: "draft" as const,
        key: `d:${story.id}`,
        importance: story.importance,
        story,
      })),
    ];
    return items.sort((a, b) => b.importance - a.importance);
  }, [pendingClusters, remainingDrafts]);

  const runScan = async (category?: StoryCategoryBucket) => {
    setScanning(category ?? "all");
    setScanError(null);
    try {
      const res = await fetch("/api/admin/editor/scan", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(category ? { category } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
        clusters?: DeskCluster[];
        cached_at?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : data.details ?? "Scan failed",
        );
      }
      const found = Array.isArray(data.clusters) ? data.clusters : [];
      if (category) {
        setClusters((prev) => [
          ...prev.filter(
            (c) => normalizeStoryCategory(c.category) !== category,
          ),
          ...found,
        ]);
      } else {
        setClusters(found);
      }
      if (data.cached_at) setCachedAt(data.cached_at);
      setClusterStates({});
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(null);
    }
  };

  const handleGenerate = async (cluster: DeskCluster) => {
    const key = clusterKey(cluster);
    setClusterStates((prev) => ({ ...prev, [key]: { status: "generating" } }));
    try {
      const ids = selectGenerateArticleIds(cluster.articles).join(",");
      if (!ids) throw new Error("No articles to generate from.");
      const res = await fetch(
        `/api/arc/generate?id=${encodeURIComponent(ids)}&importance=${cluster.importance}`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved_story?: {
          id?: string;
          arc_headline?: string;
          arc_summary?: string;
          importance?: number;
          arc_key_points?: ReviewStory["key_points"];
          arc_report?: ReviewStory["report"];
          verification?: Verification | null;
        };
        verification?: Verification | null;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Generation failed",
        );
      }
      const storyId = data.saved_story?.id;
      if (!storyId) throw new Error("No story id returned.");

      const verification =
        data.verification ?? data.saved_story?.verification ?? null;
      const draft: ReviewStory = {
        id: storyId,
        article_id: cluster.article_ids[0]!,
        article_ids: cluster.article_ids,
        headline: data.saved_story?.arc_headline ?? cluster.topic,
        standfirst: data.saved_story?.arc_summary ?? cluster.why_it_matters,
        importance: data.saved_story?.importance ?? cluster.importance,
        key_points: Array.isArray(data.saved_story?.arc_key_points)
          ? data.saved_story.arc_key_points
          : [],
        report: data.saved_story?.arc_report ?? null,
        verification,
        sources: cluster.articles.map((a) => ({
          id: a.id,
          title: a.title,
          link: null,
          source_name: a.source_name,
          published_at: a.published_at,
        })),
        entities: [],
        events: [],
        published_at: null,
        newest_source_at:
          cluster.articles
            .map((a) => a.published_at)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
      };

      setClusterStates((prev) => ({
        ...prev,
        [key]: { status: "done", storyId },
      }));
      setGenres((prev) =>
        prev.map((g) =>
          g.bucket === active.bucket
            ? { ...g, drafts: [draft, ...g.drafts.filter((d) => d.id !== storyId)] }
            : g,
        ),
      );
      setIncluded((prev) => ({
        ...prev,
        [storyId]:
          isPublishableVerification(verification) &&
          !isStaleSource(draft.newest_source_at),
      }));
      setExpandedDrafts((prev) => ({ ...prev, [storyId]: true }));
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setClusterStates((prev) => ({
        ...prev,
        [key]: {
          status: "failed",
          error: err instanceof Error ? err.message : "Generation failed",
        },
      }));
    }
  };

  const updateDraft = (storyId: string, next: ReviewStory) => {
    setGenres((prev) =>
      prev.map((g) => ({
        ...g,
        drafts: g.drafts.map((d) => (d.id === storyId ? next : d)),
      })),
    );
  };

  const removeDraft = (storyId: string) => {
    setGenres((prev) =>
      prev.map((g) => ({
        ...g,
        drafts: g.drafts.filter((d) => d.id !== storyId),
      })),
    );
  };

  const verifyNow = async (story: ReviewStory) => {
    setVerifying((prev) => ({ ...prev, [story.id]: true }));
    setPublishError(null);
    try {
      const res = await fetch(
        `/api/admin/stories/${encodeURIComponent(story.id)}/verify`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        verification?: Verification | null;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Verification failed",
        );
      }
      const verification = data.verification ?? null;
      updateDraft(story.id, { ...story, verification });
      setIncluded((prev) => ({
        ...prev,
        [story.id]:
          isPublishableVerification(verification) &&
          !isStaleSource(story.newest_source_at),
      }));
    } catch (err: unknown) {
      setPublishError(
        err instanceof Error ? err.message : "Verification failed",
      );
    } finally {
      setVerifying((prev) => ({ ...prev, [story.id]: false }));
    }
  };

  const regenerate = async (story: ReviewStory) => {
    setRegenerating((prev) => ({ ...prev, [story.id]: true }));
    setPublishError(null);
    try {
      const ids = selectGenerateArticleIds(
        story.sources.map((s) => ({
          id: s.id,
          source_name: s.source_name,
          published_at: s.published_at,
        })),
      );
      const idParam = (
        ids.length > 0
          ? ids
          : capArticleIds(
              story.article_ids.length > 0
                ? story.article_ids
                : [story.article_id],
            )
      ).join(",");
      const res = await fetch(
        `/api/arc/generate?id=${encodeURIComponent(idParam)}&importance=${story.importance}`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved_story?: {
          id?: string;
          arc_headline?: string;
          arc_summary?: string;
          importance?: number;
          arc_key_points?: ReviewStory["key_points"];
          arc_report?: ReviewStory["report"];
          verification?: Verification | null;
        };
        verification?: Verification | null;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Regenerate failed",
        );
      }
      const saved = data.saved_story;
      const verification = data.verification ?? saved?.verification ?? null;
      const nextId = saved?.id ?? story.id;
      const next: ReviewStory = {
        ...story,
        id: nextId,
        headline: saved?.arc_headline ?? story.headline,
        standfirst: saved?.arc_summary ?? story.standfirst,
        importance: saved?.importance ?? story.importance,
        key_points: Array.isArray(saved?.arc_key_points)
          ? saved.arc_key_points
          : story.key_points,
        report: saved?.arc_report ?? story.report,
        verification,
      };
      setGenres((prev) =>
        prev.map((g) => ({
          ...g,
          drafts: g.drafts.map((d) =>
            d.id === story.id || d.id === nextId ? next : d,
          ),
        })),
      );
      setIncluded((prev) => ({
        ...prev,
        [nextId]:
          isPublishableVerification(verification) &&
          !isStaleSource(story.newest_source_at),
      }));
    } catch (err: unknown) {
      setPublishError(
        err instanceof Error ? err.message : "Regenerate failed",
      );
    } finally {
      setRegenerating((prev) => ({ ...prev, [story.id]: false }));
    }
  };

  const archiveStory = async (story: ReviewStory) => {
    setArchiving((prev) => ({ ...prev, [story.id]: true }));
    try {
      const res = await fetch(
        `/api/admin/stories/${encodeURIComponent(story.id)}/archive`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Archive failed",
        );
      }
      removeDraft(story.id);
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setArchiving((prev) => ({ ...prev, [story.id]: false }));
    }
  };

  const publish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/admin/review/publish", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: active.slug,
          story_ids: includedIds,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        results?: PublishResult[];
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Publish failed",
        );
      }
      const results = data.results ?? [];
      setPublishResults(results);
      const okIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
      const okCount = okIds.size;
      setGenres((prev) =>
        prev.map((g) =>
          g.slug === active.slug
            ? {
                ...g,
                liveCount: g.liveCount + okCount,
                drafts: g.drafts.filter((d) => !okIds.has(d.id)),
                liveStories: [
                  ...g.drafts
                    .filter((d) => okIds.has(d.id))
                    .map((d) => ({
                      id: d.id,
                      headline: d.headline,
                      importance: d.importance,
                      published_at: new Date().toISOString(),
                    })),
                  ...g.liveStories,
                ],
              }
            : g,
        ),
      );
      setConfirming(false);
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const cacheLabel = cachedAt
    ? `Scan cached ${new Date(cachedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      })} UTC`
    : "No cached scan yet — run Rescan all";

  return (
    <div className="pb-28">
      <header className="border-b border-zinc-900 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
              Desk
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-zinc-100">
              {editionLabel}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {totalLiveToday} live today · target {DESK_TARGET_PER_GENRE}/genre
              <span className="mx-2 text-zinc-700">·</span>
              {cacheLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/stories"
              className="rounded-full border border-zinc-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              Stories
            </Link>
            <Link
              href="/admin/edition"
              className="rounded-full border border-zinc-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              Edition
            </Link>
            <Link
              href="/admin/sources"
              className="rounded-full border border-zinc-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              Sources
            </Link>
            <Link
              href="/admin/entities"
              className="rounded-full border border-zinc-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              Entities
            </Link>
            <SyncNewsButton />
            <button
              type="button"
              onClick={() => void runScan()}
              disabled={scanning !== null}
              className="rounded-full bg-[#c8ff00] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-black hover:opacity-90 disabled:opacity-40"
            >
              {scanning === "all" ? "Scanning…" : "Rescan all"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {genres.map((g) => {
            const activeTab = g.slug === active.slug;
            return (
              <button
                key={g.slug}
                type="button"
                onClick={() => {
                  setActiveSlug(g.slug);
                  setConfirming(false);
                  setPublishResults(null);
                  setPublishError(null);
                  const url = new URL(window.location.href);
                  url.searchParams.set("genre", g.slug);
                  window.history.replaceState({}, "", url.pathname + url.search);
                }}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  activeTab
                    ? "bg-zinc-100 text-zinc-900"
                    : "border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                }`}
              >
                {g.bucket}
                <span
                  className={`ml-1.5 tabular-nums ${
                    activeTab ? "text-zinc-500" : "text-zinc-600"
                  }`}
                >
                  {g.liveCount}/{DESK_TARGET_PER_GENRE}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{active.bucket}</h2>
          <p className="text-xs text-zinc-500">
            {pendingClusters.length} cluster
            {pendingClusters.length === 1 ? "" : "s"} · {remainingDrafts.length}{" "}
            draft{remainingDrafts.length === 1 ? "" : "s"} · {active.liveCount}{" "}
            live
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runScan(active.bucket)}
          disabled={scanning !== null}
          className="rounded-full border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
        >
          {scanning === active.bucket
            ? "Scanning…"
            : `Rescan ${active.bucket}`}
        </button>
      </div>

      {scanError ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {scanError}
        </p>
      ) : null}

      {publishResults ? (
        <section className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Publish result
          </h3>
          <ul className="mt-2 space-y-1">
            {publishResults.map((r) => (
              <li key={r.id} className="text-sm">
                {r.ok ? (
                  <span className="text-emerald-300">Live — {r.headline}</span>
                ) : (
                  <span className="text-red-300">
                    Failed — {r.headline}: {r.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-4">
        <LiveStrip stories={active.liveStories} count={active.liveCount} />
      </div>

      <div className="mt-4 space-y-2.5">
        {workspaceItems.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-600">
            Nothing to work in {active.bucket}. Rescan this genre or sync feeds.
          </p>
        ) : (
          workspaceItems.map((item) =>
            item.kind === "cluster" ? (
              <ClusterCard
                key={item.key}
                cluster={item.cluster}
                state={
                  clusterStates[clusterKey(item.cluster)] ?? { status: "pending" }
                }
                expanded={Boolean(expandedClusters[clusterKey(item.cluster)])}
                onToggle={() =>
                  setExpandedClusters((prev) => ({
                    ...prev,
                    [clusterKey(item.cluster)]: !prev[clusterKey(item.cluster)],
                  }))
                }
                onGenerate={() => void handleGenerate(item.cluster)}
              />
            ) : (
              <ReviewDraftCard
                key={item.key}
                story={item.story}
                expanded={Boolean(expandedDrafts[item.story.id])}
                included={
                  Boolean(included[item.story.id]) &&
                  isPublishableVerification(item.story.verification)
                }
                regenerating={Boolean(regenerating[item.story.id])}
                verifying={Boolean(verifying[item.story.id])}
                archiving={Boolean(archiving[item.story.id])}
                onToggleExpand={() =>
                  setExpandedDrafts((prev) => ({
                    ...prev,
                    [item.story.id]: !prev[item.story.id],
                  }))
                }
                onToggleInclude={() => {
                  if (!isPublishableVerification(item.story.verification)) return;
                  setIncluded((prev) => ({
                    ...prev,
                    [item.story.id]: !prev[item.story.id],
                  }));
                }}
                onRegenerate={() => void regenerate(item.story)}
                onVerify={() => void verifyNow(item.story)}
                onArchive={() => void archiveStory(item.story)}
              />
            ),
          )
        )}
      </div>

      {publishError ? (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {publishError}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-[var(--background)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3 md:px-10">
          <p className="text-xs text-zinc-500">
            {active.bucket} · {includedIds.length} included
            {remainingDrafts.some(
              (s) => !isPublishableVerification(s.verification),
            )
              ? " · unverified/flagged blocked"
              : ""}
          </p>
          <div className="flex items-center gap-2">
            {confirming ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={publishing}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={publishing || includedIds.length === 0}
                  className="rounded-full bg-[#c8ff00] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-black disabled:opacity-50"
                >
                  {publishing
                    ? "Publishing…"
                    : `Confirm — ${includedIds.length}`}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={includedIds.length === 0 || publishing}
                className="rounded-full bg-[#c8ff00] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-black disabled:opacity-40"
              >
                Publish section — {includedIds.length} included
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
