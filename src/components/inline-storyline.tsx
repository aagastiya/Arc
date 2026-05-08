"use client";

import { useMemo, useState } from "react";

type TimelineItem = {
  date: string;
  event: string;
};

type StorylineData = {
  title: string;
  happening: string;
  why: string[];
  related: string[];
};

const IRAN_DATA: StorylineData = {
  title: "Iran–US–Israel Tensions",
  happening:
    "A string of strikes, retaliatory warnings, and diplomatic standoffs is pushing the region closer to direct confrontation. Shipping routes, energy markets, and security postures are reacting in real time.",
  why: [
    "A miscalculation could widen beyond bilateral conflict and destabilize regional security.",
    "Energy and shipping disruptions can quickly translate into market volatility.",
    "Diplomatic credibility is at stake if deterrence fails.",
  ],
  related: [
    "How missile defense shaped the latest exchange",
    "Why maritime routes are now part of the risk map",
    "Inside the diplomatic channel trying to prevent spillover",
  ],
};

const IPL_DATA: StorylineData = {
  title: "IPL 2026 Race",
  happening:
    "The tournament has entered a high-pressure phase where net run rate, middle-order depth, and bowling rotations are deciding playoff trajectories.",
  why: [
    "A tight table makes each fixture materially change qualification scenarios.",
    "Injuries and rotations reveal which squads have depth under pressure.",
    "Late-season form tends to predict playoff momentum.",
  ],
  related: [
    "How net run rate could decide the final playoff spot",
    "The bowling units holding up under pressure",
    "Captaincy patterns that are changing close games",
  ],
};

const AI_RACE_DATA: StorylineData = {
  title: "OpenAI–Google AI Race",
  happening:
    "Model launches, enterprise integrations, and pricing moves are accelerating competition for developer mindshare and distribution.",
  why: [
    "Distribution channels can lock in long-term user behavior.",
    "Cost and reliability determine whether AI products scale beyond pilots.",
    "Ecosystem momentum often compounds into enterprise adoption.",
  ],
  related: [
    "Where enterprise AI spend is shifting this quarter",
    "The product bets defining assistant UX",
    "What benchmark wins mean in production reality",
  ],
};

const GENERIC_DATA: StorylineData = {
  title: "Developing Storyline",
  happening: "Context for this developing story is still being built.",
  why: ["This event may develop further as more verified reporting becomes available."],
  related: ["Related clips will appear here as this storyline develops."],
};

function pickStoryline(slug: string): StorylineData {
  const s = slug.toLowerCase();
  if (s.includes("iran") || s.includes("israel") || s.includes("gaza")) {
    return IRAN_DATA;
  }
  if (s.includes("ipl") || s.includes("cricket")) {
    return IPL_DATA;
  }
  if (s.includes("openai") || s.includes("google") || s.includes("ai")) {
    return AI_RACE_DATA;
  }
  return GENERIC_DATA;
}

export function InlineStoryline({
  slug,
  timelineItems,
}: {
  slug: string;
  timelineItems: TimelineItem[];
}) {
  const [open, setOpen] = useState(false);

  const data = useMemo(() => pickStoryline(slug), [slug]);

  const title =
    data === GENERIC_DATA
      ? slug
          .split("-")
          .filter(Boolean)
          .map((p) => p[0]?.toUpperCase() + p.slice(1))
          .join(" ")
      : data.title;

  const timeline = timelineItems.length
    ? timelineItems
    : [
        { date: "Now", event: "Story first detected" },
        { date: "Ongoing", event: "Reporting continues to evolve" },
        { date: "Next", event: "Additional updates expected" },
      ];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        style={{
          padding: "8px 12px",
          background: "rgba(255,255,255,0.05)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          fontSize: "11px",
          fontWeight: 600,
          color: "rgba(255,255,255,0.85)",
        }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "#c8ff00" }} aria-hidden />
        <span className="min-w-0 flex-1">Storyline {open ? "↓" : "→"}</span>
      </button>

      <div
        className={[
          "overflow-hidden transition-[max-height,opacity] duration-300 ease-out",
          open ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0",
        ].join(" ")}
      >
        <div className="pt-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Storyline</p>
          <h3 className="mt-2 text-xl font-extrabold leading-snug text-zinc-100 [font-family:var(--font-syne)]">
            {title}
          </h3>

          <div
            className="mt-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4"
            style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.02) inset" }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              What&apos;s happening
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">{data.happening}</p>
          </div>

          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Timeline</p>
            <ol className="mt-4 space-y-4">
              {timeline.map((item, idx) => (
                <li key={`${item.date}-${item.event}-${idx}`} className="relative pl-6">
                  {idx < timeline.length - 1 ? (
                    <span
                      className="absolute left-[8px] top-5 w-px bg-zinc-800"
                      style={{ height: "calc(100% + 12px)" }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-[#c8ff00]" aria-hidden />
                  <p className="text-xs text-zinc-500">{item.date}</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-300">{item.event}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Why this matters</p>
            <ul className="mt-3 space-y-2">
              {data.why.map((item) => (
                <li
                  key={item}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/20 px-3 py-2 text-sm leading-relaxed text-zinc-300"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Related clips</p>
            <div className="mt-3 space-y-2">
              {data.related.map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/25 px-3 py-3 text-sm text-zinc-200"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

