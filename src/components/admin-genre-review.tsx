"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { Verification, VerificationFlag } from "@/lib/arc/verification";
import {
  isFlaggedVerification,
  isPublishableVerification,
  isUnverified,
} from "@/lib/arc/verification";

export type ReviewSource = {
  id: string;
  title: string;
  link: string | null;
  source_name: string | null;
};

export type ReviewEntity = {
  entity_id: string;
  name: string;
  kind: string;
  role: string;
  short_description: string;
};

export type ReviewEvent = {
  event_id: string;
  title: string;
  open_question: string;
};

export type ReviewKeyPoint = {
  text: string;
  source: string;
};

export type ReviewReport = {
  lead: string;
  sections: Array<{ title: string; body: string }>;
};

export type ReviewStory = {
  id: string;
  article_id: string;
  article_ids: string[];
  headline: string;
  standfirst: string;
  importance: number;
  key_points: ReviewKeyPoint[];
  report: ReviewReport | null;
  verification: Verification | null;
  sources: ReviewSource[];
  entities: ReviewEntity[];
  events: ReviewEvent[];
};

type PublishResult =
  | { id: string; ok: true; headline: string }
  | { id: string; ok: false; headline: string; error: string };

function VerificationBadge({ verification }: { verification: Verification | null }) {
  if (isUnverified(verification)) {
    return (
      <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Unverified
      </span>
    );
  }
  if (isPublishableVerification(verification)) {
    return (
      <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
        Verified
      </span>
    );
  }
  const flags = verification!.flags.length;
  return (
    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
      {flags} {flags === 1 ? "flag" : "flags"}
    </span>
  );
}

function FlagDetails({ flags }: { flags: VerificationFlag[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {flags.map((flag, i) => (
        <li
          key={`${flag.claim}-${i}`}
          className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
            {flag.reason.replace(/_/g, " ")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-200">
            &ldquo;{flag.claim}&rdquo;
          </p>
          {flag.note ? (
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{flag.note}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function StoryCard({
  story,
  expanded,
  included,
  regenerating,
  verifying,
  onToggleExpand,
  onToggleInclude,
  onRegenerate,
  onVerify,
}: {
  story: ReviewStory;
  expanded: boolean;
  included: boolean;
  regenerating: boolean;
  verifying: boolean;
  onToggleExpand: () => void;
  onToggleInclude: () => void;
  onRegenerate: () => void;
  onVerify: () => void;
}) {
  const flagged = isFlaggedVerification(story.verification);
  const unverified = isUnverified(story.verification);
  const blocked = !isPublishableVerification(story.verification);
  const event = story.events[0] ?? null;

  return (
    <article
      className={`rounded-lg border transition-colors ${
        flagged
          ? "border-amber-500/35 bg-amber-500/[0.04]"
          : unverified
            ? "border-zinc-700 bg-zinc-950/60"
            : included
              ? "border-zinc-800 bg-zinc-900/40"
              : "border-zinc-900 bg-zinc-950/50 opacity-70"
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          onClick={onToggleInclude}
          disabled={blocked}
          title={
            flagged
              ? "Flagged stories cannot be included until regenerated clean"
              : unverified
                ? "Unverified stories cannot be included until verified"
                : included
                  ? "Exclude from this publish"
                  : "Include in this publish"
          }
          aria-pressed={included}
          aria-label={included ? "Exclude story" : "Include story"}
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            included
              ? "border-zinc-600 text-zinc-300 hover:border-red-400 hover:text-red-300"
              : "border-zinc-800 text-zinc-600 hover:border-zinc-500 hover:text-zinc-300"
          }`}
        >
          {included ? "✗" : "○"}
        </button>

        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <VerificationBadge verification={story.verification} />
            <span className="text-[11px] text-zinc-500">
              Importance {story.importance}/5
            </span>
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                included ? "text-[#c8ff00]" : "text-zinc-600"
              }`}
            >
              {included ? "Included" : "Excluded"}
            </span>
            {event ? (
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">
                {event.title}
              </span>
            ) : null}
          </div>

          <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-zinc-50">
            {story.headline}
          </h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-400">
            {story.standfirst}
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-wider text-zinc-600">
            {expanded ? "Collapse" : "Read full story"}
          </p>
        </button>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-6 border-t border-zinc-900 px-4 pb-5 pt-4 md:pl-14">
            {story.key_points.length > 0 ? (
              <section>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  Key points
                </h4>
                <ul className="mt-2 space-y-2.5">
                  {story.key_points.map((point, i) => (
                    <li key={i} className="text-[15px] leading-relaxed text-zinc-200">
                      <span className="text-[#c8ff00]">·</span> {point.text}
                      {point.source ? (
                        <span className="ml-2 text-xs text-zinc-600">
                          ({point.source})
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {story.report ? (
              <section className="space-y-4">
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  Report
                </h4>
                <p className="text-[15px] leading-[1.7] text-zinc-200">
                  {story.report.lead}
                </p>
                {story.report.sections.map((section) => (
                  <div key={section.title}>
                    <h5 className="text-sm font-semibold text-zinc-100">
                      {section.title}
                    </h5>
                    <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-[1.7] text-zinc-300">
                      {section.body}
                    </p>
                  </div>
                ))}
              </section>
            ) : null}

            {story.sources.length > 0 ? (
              <section>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  Sources
                </h4>
                <ul className="mt-2 space-y-1">
                  {story.sources.map((source) => (
                    <li key={source.id} className="text-sm text-zinc-400">
                      {source.source_name ? (
                        <span className="text-zinc-500">{source.source_name} · </span>
                      ) : null}
                      {source.link ? (
                        <a
                          href={source.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[#c8ff00]"
                        >
                          {source.title}
                        </a>
                      ) : (
                        source.title
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {story.entities.length > 0 ? (
              <section>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                  Graph
                </h4>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {story.entities.map((entity) => (
                    <li
                      key={entity.entity_id}
                      className="rounded-full border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300"
                      title={entity.short_description}
                    >
                      <span className="text-zinc-100">{entity.name}</span>
                      <span className="ml-1.5 text-zinc-600">
                        {entity.role} · {entity.kind}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {story.verification && story.verification.flags.length > 0 ? (
              <section>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-amber-400">
                  Verification flags
                </h4>
                <FlagDetails flags={story.verification.flags} />
              </section>
            ) : story.verification ? (
              <p className="text-sm text-emerald-400">
                All {story.verification.claims_checked} claims verified against
                sources.
              </p>
            ) : (
              <p className="text-sm text-zinc-500">
                No verification run yet. Verify before this story can join the
                batch.
              </p>
            )}

            {unverified ? (
              <div className="flex flex-wrap items-center gap-3 rounded border border-zinc-700 bg-zinc-950/80 px-3 py-2.5">
                <p className="flex-1 text-xs leading-relaxed text-zinc-400">
                  Unverified stories stay out of the batch. Run verification on
                  the existing draft — no regeneration.
                </p>
                <button
                  type="button"
                  onClick={onVerify}
                  disabled={verifying}
                  className="rounded-full border border-[#c8ff00]/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#c8ff00] transition-colors hover:bg-[#c8ff00] hover:text-black disabled:opacity-50"
                >
                  {verifying ? "Verifying…" : "Verify now"}
                </button>
              </div>
            ) : null}

            {flagged ? (
              <div className="flex flex-wrap items-center gap-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                <p className="flex-1 text-xs leading-relaxed text-amber-200/90">
                  Flagged stories stay out of the batch. Regenerate to try again,
                  or leave excluded.
                </p>
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={regenerating}
                  className="rounded-full border border-amber-400/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-200 transition-colors hover:bg-amber-400 hover:text-black disabled:opacity-50"
                >
                  {regenerating ? "Regenerating…" : "Regenerate"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export function AdminGenreReview({
  categorySlug,
  categoryLabel,
  liveCount,
  initialStories,
}: {
  categorySlug: string;
  categoryLabel: string;
  liveCount: number;
  initialStories: ReviewStory[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [stories, setStories] = useState(initialStories);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      initialStories.map((s) => [
        s.id,
        isPublishableVerification(s.verification),
      ]),
    ),
  );
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(
    null,
  );
  const [livePublished, setLivePublished] = useState(liveCount);

  const draftStories = stories;
  const publishedIds = useMemo(
    () => new Set((publishResults ?? []).filter((r) => r.ok).map((r) => r.id)),
    [publishResults],
  );

  const remaining = draftStories.filter((s) => !publishedIds.has(s.id));
  const includedIds = remaining
    .filter(
      (s) =>
        included[s.id] && isPublishableVerification(s.verification),
    )
    .map((s) => s.id);
  const excludedRemaining = remaining.filter(
    (s) => !includedIds.includes(s.id),
  );

  const toggleInclude = (story: ReviewStory) => {
    if (!isPublishableVerification(story.verification)) return;
    setIncluded((prev) => ({ ...prev, [story.id]: !prev[story.id] }));
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
      const clean = isPublishableVerification(verification);

      setStories((prev) =>
        prev.map((s) => (s.id === story.id ? { ...s, verification } : s)),
      );
      setIncluded((prev) => ({ ...prev, [story.id]: clean }));
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying((prev) => ({ ...prev, [story.id]: false }));
    }
  };

  const regenerate = async (story: ReviewStory) => {
    setRegenerating((prev) => ({ ...prev, [story.id]: true }));
    setPublishError(null);
    try {
      const ids = (story.article_ids.length > 0
        ? story.article_ids
        : [story.article_id]
      )
        .slice(0, 5)
        .join(",");
      const res = await fetch(
        `/api/arc/generate?id=${encodeURIComponent(ids)}&importance=${story.importance}`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved_story?: {
          id?: string;
          arc_headline?: string;
          arc_summary?: string;
          importance?: number;
          arc_key_points?: ReviewKeyPoint[];
          arc_report?: ReviewReport | null;
          verification?: Verification | null;
        };
        verification?: Verification | null;
        graph?: {
          entities?: Array<{
            id: string;
            name: string;
            kind: string;
            role: string;
            short_description: string;
          }>;
          event?: {
            action: string;
            event_id: string | null;
            title: string | null;
            open_question: string | null;
          };
        } | null;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Regenerate failed",
        );
      }

      const saved = data.saved_story;
      const verification = data.verification ?? saved?.verification ?? null;
      const clean = isPublishableVerification(verification);

      setStories((prev) =>
        prev.map((s) => {
          if (s.id !== story.id && s.id !== saved?.id) return s;
          const entities =
            data.graph?.entities?.map((e) => ({
              entity_id: e.id,
              name: e.name,
              kind: e.kind,
              role: e.role,
              short_description: e.short_description,
            })) ?? s.entities;
          const events =
            data.graph?.event?.action !== "none" &&
            data.graph?.event?.event_id &&
            data.graph.event.title
              ? [
                  {
                    event_id: data.graph.event.event_id,
                    title: data.graph.event.title,
                    open_question: data.graph.event.open_question ?? "",
                  },
                ]
              : s.events;
          return {
            ...s,
            id: saved?.id ?? s.id,
            headline: saved?.arc_headline ?? s.headline,
            standfirst: saved?.arc_summary ?? s.standfirst,
            importance: saved?.importance ?? s.importance,
            key_points: Array.isArray(saved?.arc_key_points)
              ? saved.arc_key_points
              : s.key_points,
            report: saved?.arc_report ?? s.report,
            verification,
            entities,
            events,
          };
        }),
      );

      const nextId = saved?.id ?? story.id;
      setIncluded((prev) => ({ ...prev, [nextId]: clean }));
      if (nextId !== story.id) {
        setExpanded((prev) => {
          const next = { ...prev };
          if (prev[story.id]) next[nextId] = true;
          delete next[story.id];
          return next;
        });
      }
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegenerating((prev) => ({ ...prev, [story.id]: false }));
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
          category: categorySlug,
          story_ids: includedIds,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        published?: number;
        results?: PublishResult[];
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Publish failed",
        );
      }
      const results = data.results ?? [];
      setPublishResults(results);
      const okCount = results.filter((r) => r.ok).length;
      setLivePublished((n) => n + okCount);
      setConfirming(false);
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="pb-28">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Genre Review
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[#c8ff00]">
            {categoryLabel}
          </h1>
          <span className="text-sm text-zinc-500">
            {livePublished} live · {remaining.length} draft
            {remaining.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Read every draft here. Verified-clean stories start included; unverified
          and flagged ones stay out until fixed. Publish puts the included set
          live and approves their graph links first.
        </p>
      </header>

      {publishResults ? (
        <section className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Publish result
          </h2>
          <ul className="mt-2 space-y-1.5">
            {publishResults.map((r) => (
              <li key={r.id} className="text-sm">
                {r.ok ? (
                  <span className="text-emerald-300">
                    Live — {r.headline || r.id}
                  </span>
                ) : (
                  <span className="text-red-300">
                    Failed — {r.headline || r.id}: {r.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {remaining.length === 0 ? (
        <p className="py-10 text-sm italic text-zinc-600">
          No unpublished drafts in this section.
        </p>
      ) : (
        <div className="space-y-3">
          {remaining.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              expanded={Boolean(expanded[story.id])}
              included={
                Boolean(included[story.id]) &&
                isPublishableVerification(story.verification)
              }
              regenerating={Boolean(regenerating[story.id])}
              verifying={Boolean(verifying[story.id])}
              onToggleExpand={() =>
                setExpanded((prev) => ({
                  ...prev,
                  [story.id]: !prev[story.id],
                }))
              }
              onToggleInclude={() => toggleInclude(story)}
              onRegenerate={() => void regenerate(story)}
              onVerify={() => void verifyNow(story)}
            />
          ))}
        </div>
      )}

      {excludedRemaining.length > 0 && publishResults ? (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Not published ({excludedRemaining.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {excludedRemaining.map((story) => (
              <li
                key={story.id}
                className="border-b border-zinc-900 py-2 text-sm text-zinc-400"
              >
                {story.headline}
                {isFlaggedVerification(story.verification) ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400">
                    flagged
                  </span>
                ) : isUnverified(story.verification) ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-zinc-500">
                    unverified
                  </span>
                ) : (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-zinc-600">
                    excluded
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {publishError ? (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {publishError}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-[var(--background)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-3 md:px-10">
          <p className="text-xs text-zinc-500">
            {includedIds.length} of {remaining.length} selected
            {remaining.some((s) => !isPublishableVerification(s.verification))
              ? " · unverified and flagged stories blocked"
              : ""}
          </p>
          <div className="flex items-center gap-2">
            {confirming ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={publishing}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={publishing || includedIds.length === 0}
                  className="rounded-full bg-[#c8ff00] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-black hover:opacity-90 disabled:opacity-50"
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
                className="rounded-full bg-[#c8ff00] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-black transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Publish section — {includedIds.length}{" "}
                {includedIds.length === 1 ? "story" : "stories"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
