"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatRelativeTime } from "@/lib/time";

import type { ArticleWithSource } from "@/lib/articles";

const ACCENT = "#DFFF00";

const TABS: { slug: string; label: string }[] = [
  { slug: "today", label: "Today" },
  { slug: "world", label: "World" },
  { slug: "india", label: "India" },
  { slug: "tech", label: "Tech" },
  { slug: "clips", label: "Clips" },
  { slug: "verify", label: "Verify" },
];

const BOTTOM_NAV: { cat: string; label: string; icon: string }[] = [
  { cat: "today", label: "Today", icon: "◉" },
  { cat: "clips", label: "Clips", icon: "▶" },
  { cat: "verify", label: "Verify", icon: "✓" },
  { cat: "topics", label: "Topics", icon: "#" },
  { cat: "you", label: "You", icon: "○" },
];

function categoryLabel(cat: string): string {
  return cat.replace(/^\w/, (c) => c.toUpperCase());
}

type FeedAppProps = {
  articles: ArticleWithSource[];
  currentCat: string;
  configMissing: boolean;
  placeholder?: "clips" | "verify" | "topics" | "you";
};

export function FeedApp({
  articles,
  currentCat,
  configMissing,
  placeholder,
}: FeedAppProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hero = articles[0];
  const rest = articles.slice(1);

  const dateLabel = useMemo(() => {
    return new Date().toLocaleDateString("en", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, []);

  return (
    <div className="flex min-h-full flex-col bg-black font-sans text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-900 bg-black/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span
            className="text-xl font-black tracking-tight"
            style={{ color: ACCENT }}
          >
            NEWOOZ
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs text-zinc-400">
            {dateLabel}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-500">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ACCENT }} />
          <span className="truncate">Search or verify a story…</span>
        </div>
        <nav className="mt-3 flex gap-5 overflow-x-auto pb-1 text-sm font-medium [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const active = currentCat === t.slug;
            return (
              <Link
                key={t.slug}
                href={`/?cat=${t.slug}`}
                className={`shrink-0 border-b-2 pb-1 transition-colors ${
                  active
                    ? "border-[#DFFF00] text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
                style={active ? { borderColor: ACCENT } : undefined}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex flex-1 flex-col px-4 pb-28 pt-4">
        {configMissing && (
          <p className="mb-6 rounded-xl border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-200/90">
            Add{" "}
            <code className="rounded bg-black/40 px-1 font-mono text-xs">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            and{" "}
            <code className="rounded bg-black/40 px-1 font-mono text-xs">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            to <code className="font-mono text-xs">.env.local</code>, run the SQL
            in <code className="font-mono text-xs">supabase/migrations/</code>,
            then sync RSS.
          </p>
        )}

        {placeholder && (
          <p className="mb-6 text-center text-sm text-zinc-500">
            {placeholder === "clips" &&
              "Video clips will plug in here (YouTube, Shorts, or your clip index)."}
            {placeholder === "verify" &&
              "Fact-check and source verification tools can attach here."}
            {placeholder === "topics" &&
              "Topic bundles and saved interests — wire when you add auth."}
            {placeholder === "you" &&
              "Profile and saved items — wire when you add auth."}
          </p>
        )}

        {!placeholder && !hero && !configMissing && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm text-zinc-500">No stories yet.</p>
            <p className="max-w-xs text-xs text-zinc-600">
              Run{" "}
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-zinc-400">
                POST /api/rss/sync
              </code>{" "}
              with{" "}
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-zinc-400">
                CRON_SECRET
              </code>{" "}
              (or in dev without secret) after adding{" "}
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-zinc-400">
                SUPABASE_SERVICE_ROLE_KEY
              </code>
              .
            </p>
          </div>
        )}

        {hero && !placeholder && (
          <article className="mb-8 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            <div className="relative aspect-[16/10] w-full bg-zinc-900">
              {hero.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- RSS from arbitrary domains
                <img
                  src={hero.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                  No image
                </div>
              )}
              <div className="absolute left-3 top-3 flex gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: ACCENT, color: "#000" }}
                >
                  {hero.feeds?.source_name ?? "Feed"}
                </span>
                <span className="rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                  Breaking
                </span>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <p
                className="text-[11px] font-bold uppercase tracking-widest"
                style={{ color: ACCENT }}
              >
                {categoryLabel(hero.category)}
              </p>
              <h2 className="text-xl font-semibold leading-snug text-white">
                {hero.title}
              </h2>
              <p className="text-xs text-zinc-500">
                {hero.feeds?.source_name ?? "Source"} ·{" "}
                {formatRelativeTime(hero.published_at) || "recently"}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((id) => (id === hero.id ? null : hero.id))
                  }
                  className="rounded-full px-5 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
                  style={{ background: ACCENT }}
                >
                  Read story
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-300"
                >
                  <span aria-hidden>▶</span> Watch clips
                </button>
              </div>
              {expandedId === hero.id && (
                <div className="border-t border-zinc-800 pt-4 text-sm leading-relaxed text-zinc-300">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Quick context
                  </p>
                  <p>
                    {hero.summary?.trim() ||
                      "Open the original story for full reporting."}
                  </p>
                  <a
                    href={hero.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm font-medium underline"
                    style={{ color: ACCENT }}
                  >
                    Open original →
                  </a>
                </div>
              )}
            </div>
          </article>
        )}

        {rest.length > 0 && !placeholder && (
          <ol className="flex flex-col gap-6">
            {rest.map((item, i) => {
              const num = String(i + 2).padStart(2, "0");
              const open = expandedId === item.id;
              return (
                <li key={item.id} className="flex gap-3">
                  <span
                    className="w-7 shrink-0 pt-0.5 text-lg font-light text-zinc-600"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {num}
                  </span>
                  <div className="min-w-0 flex-1 border-b border-zinc-900 pb-6">
                    <p
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: ACCENT }}
                    >
                      {categoryLabel(item.category)}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId((id) => (id === item.id ? null : item.id))
                      }
                      className="mt-1 w-full text-left"
                    >
                      <span className="text-base font-semibold leading-snug text-white">
                        {item.title}
                      </span>
                    </button>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.feeds?.source_name ?? "Source"} ·{" "}
                      {formatRelativeTime(item.published_at) || "recently"}
                    </p>
                    {open && (
                      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                        {item.summary?.trim() ||
                          "No summary in the feed — open the original article."}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium underline"
                        style={{ color: ACCENT }}
                      >
                        Read source
                      </a>
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-500"
                        aria-hidden
                      >
                        ▶
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 flex justify-around border-t border-zinc-900 bg-black/95 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
        {BOTTOM_NAV.map((n) => {
          const href = `/?cat=${n.cat}`;
          const active = currentCat === n.cat;
          return (
            <Link
              key={n.cat}
              href={href}
              className={`flex min-w-[56px] flex-col items-center gap-0.5 text-[10px] ${
                active ? "" : "text-zinc-600"
              }`}
              style={active ? { color: ACCENT } : undefined}
            >
              <span className="text-base opacity-80">{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
