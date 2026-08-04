"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { normalizeStoryCategory } from "@/lib/categories";

export type StorylineKeyPoint = {
  text: string;
  source: string;
};

export type StorylineReportSection = {
  title: string;
  body: string;
};

export type StorylineReport = {
  lead: string;
  sections: StorylineReportSection[];
};

export type StorylineBeat = {
  date: string;
  event: string;
};

export type StorylineCardsProps = {
  headline: string;
  summary: string;
  category: string;
  coverImageUrl: string | null;
  keyPoints: StorylineKeyPoint[];
  report: StorylineReport | null;
  storyline: StorylineBeat[];
};

function categoryLabel(raw: string): string {
  const bucket = normalizeStoryCategory(raw);
  return bucket === "Other" ? raw.trim() || "Story" : bucket;
}

function formatCaughtUpDate(date: Date = new Date()): string {
  return date.toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SourceChip({ source }: { source: string }) {
  return (
    <span className="inline-block shrink-0 rounded border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
      {source}
    </span>
  );
}

function CoverCard({
  headline,
  category,
  coverImageUrl,
}: {
  headline: string;
  category: string;
  coverImageUrl: string | null;
}) {
  return (
    <article
      data-card-type="cover"
      className="relative min-h-[280px] overflow-hidden rounded-2xl bg-[var(--card)]"
    >
      {coverImageUrl ? (
        <Image
          src={coverImageUrl}
          alt=""
          fill
          unoptimized
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 640px"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(160deg, var(--elevated) 0%, var(--background) 100%)",
          }}
          aria-hidden
        />
      )}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: "linear-gradient(transparent 25%, rgba(0,0,0,0.88) 100%)",
        }}
        aria-hidden
      />
      <div className="relative z-10 flex h-full min-h-[280px] flex-col justify-end p-5 md:p-6">
        <span className="mb-3 inline-flex w-fit rounded border border-zinc-600/80 bg-black/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
          {categoryLabel(category)}
        </span>
        <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-white [font-family:var(--font-syne)] md:text-3xl">
          {headline}
        </h2>
      </div>
    </article>
  );
}

function NowCard({ summary }: { summary: string }) {
  return (
    <article
      data-card-type="now"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-5 md:p-6"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Where this stands
      </p>
      <p className="mt-3 text-base leading-relaxed text-zinc-200 md:text-lg">{summary}</p>
    </article>
  );
}

function BeatCard({ date, event }: StorylineBeat) {
  return (
    <article
      data-card-type="beat"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-5 md:p-6"
    >
      <p className="text-3xl font-extrabold tracking-tight text-zinc-100 [font-family:var(--font-syne)] md:text-4xl">
        {date}
      </p>
      <p className="mt-3 text-base leading-relaxed text-zinc-300 md:text-lg">{event}</p>
    </article>
  );
}

function KeyFactsCard({ points }: { points: StorylineKeyPoint[] }) {
  return (
    <article
      data-card-type="key-facts"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-5 md:p-6"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Key facts
      </p>
      <ul className="mt-4 space-y-4">
        {points.map((point, index) => (
          <li
            key={`${index}-${point.text.slice(0, 24)}`}
            className="border-t border-zinc-800/80 pt-4 first:border-t-0 first:pt-0"
          >
            <p className="text-sm leading-relaxed text-zinc-200 md:text-base">{point.text}</p>
            {point.source.trim() ? (
              <div className="mt-2">
                <SourceChip source={point.source.trim()} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}

function DeepDiveCard({ report }: { report: StorylineReport }) {
  const [open, setOpen] = useState(false);
  const sections = report.sections.filter(
    (s) => s.title.trim() && s.body.trim(),
  );

  return (
    <article
      data-card-type="deep-dive"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-5 md:p-6"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl px-4 py-3.5 text-center text-sm font-bold tracking-wide text-[#141414]"
        style={{ backgroundColor: "#c8ff00" }}
        aria-expanded={open}
      >
        Deep dive
      </button>

      {open ? (
        <div className="mt-5 space-y-6">
          {report.lead.trim() ? (
            <p className="whitespace-pre-wrap text-base leading-relaxed text-zinc-200 md:text-lg">
              {report.lead.trim()}
            </p>
          ) : null}
          {sections.map((section, index) => (
            <section key={`${index}-${section.title}`}>
              <h3 className="text-lg font-extrabold leading-snug text-zinc-100 [font-family:var(--font-syne)] md:text-xl">
                {section.title}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300 md:text-base">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CaughtUpCard() {
  const dateLabel = useMemo(() => formatCaughtUpDate(), []);

  return (
    <article
      data-card-type="caught-up"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-8 text-center md:px-6"
    >
      <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-zinc-600 text-zinc-400">
        <span className="text-sm" aria-hidden>
          ✓
        </span>
      </div>
      <p className="mt-3 text-lg font-semibold text-zinc-200 [font-family:var(--font-syne)]">
        You&apos;re caught up
      </p>
      <p className="mt-1 text-xs text-zinc-500">{dateLabel}</p>
    </article>
  );
}

function hasReportContent(report: StorylineReport | null): report is StorylineReport {
  if (!report) {
    return false;
  }
  const lead = report.lead.trim();
  const sections = report.sections.filter(
    (s) => s.title.trim() && s.body.trim(),
  );
  return Boolean(lead) || sections.length > 0;
}

export function StorylineCards({
  headline,
  summary,
  category,
  coverImageUrl,
  keyPoints,
  report,
  storyline,
}: StorylineCardsProps) {
  const beats = storyline.filter((b) => b.date.trim() && b.event.trim());
  const facts = keyPoints.filter((p) => p.text.trim());
  const showCover = Boolean(headline.trim());
  const showNow = Boolean(summary.trim());
  const showDeepDive = hasReportContent(report);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 pb-2">
      {showCover ? (
        <CoverCard
          headline={headline.trim()}
          category={category}
          coverImageUrl={coverImageUrl}
        />
      ) : null}
      {showNow ? <NowCard summary={summary.trim()} /> : null}
      {beats.map((beat, index) => (
        <BeatCard key={`${beat.date}-${index}`} date={beat.date} event={beat.event} />
      ))}
      {facts.length > 0 ? <KeyFactsCard points={facts} /> : null}
      {showDeepDive ? <DeepDiveCard report={report} /> : null}
      <CaughtUpCard />
    </div>
  );
}
