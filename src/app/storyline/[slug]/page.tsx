import Link from "next/link";

type StorylinePageProps = {
  params: Promise<{ slug: string }>;
};

type StorylineData = {
  title: string;
  happening: string;
  events: Array<{ date: string; title: string; detail: string }>;
  why: string[];
  related: string[];
};

const IRAN_DATA: StorylineData = {
  title: "Iran-US-Israel Tensions",
  happening:
    "A string of military strikes, retaliatory warnings, and diplomatic standoffs is pulling regional actors into a wider confrontation. Markets, shipping routes, and global security calculations are reacting in real time.",
  events: [
    {
      date: "Apr 2",
      title: "Embassy-linked strike raises regional alert",
      detail:
        "A high-impact strike tied to diplomatic infrastructure triggers immediate retaliation threats and emergency military coordination.",
    },
    {
      date: "Apr 8",
      title: "Missile and drone launches escalate the cycle",
      detail:
        "Coordinated launches and interceptions expand the conflict footprint, with both sides signaling readiness for another round.",
    },
    {
      date: "Apr 13",
      title: "Allies issue red-line warnings",
      detail:
        "Washington and regional partners move naval and air assets, while back-channel talks attempt to prevent direct state-to-state war.",
    },
    {
      date: "Apr 20",
      title: "Counterstrikes create a fragile pause",
      detail:
        "A limited response is framed as deterrence, but intelligence assessments warn that miscalculation risk remains elevated.",
    },
  ],
  why: [
    "A prolonged cycle could expand beyond bilateral conflict and destabilize wider Middle East security architecture.",
    "Energy and shipping disruptions can quickly translate into inflation and market volatility across multiple regions.",
    "Diplomatic credibility is at stake: if deterrence fails, future crises become harder to contain.",
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
  events: [
    {
      date: "Week 1",
      title: "Power-packed start resets title expectations",
      detail:
        "Early upsets and breakout batting performances disrupt pre-season predictions across both groups.",
    },
    {
      date: "Week 3",
      title: "Injuries force tactical reshuffles",
      detail:
        "Teams rotate all-rounders and death-over specialists, changing matchups and finishing patterns.",
    },
    {
      date: "Week 5",
      title: "Playoff bubble tightens",
      detail:
        "Multiple teams remain in contention, making each remaining fixture critical for qualification scenarios.",
    },
  ],
  why: [
    "Franchise decisions now shape auction strategy and retention priorities for the next cycle.",
    "A close standings table increases pressure on leadership and in-game tactical calls.",
    "Form in this window often predicts playoff momentum and title probability.",
  ],
  related: [
    "How net run rate could decide the final playoff spot",
    "The bowling units holding up under pressure",
    "Captaincy patterns that are changing close games",
  ],
};

const AI_RACE_DATA: StorylineData = {
  title: "OpenAI-Google AI Race",
  happening:
    "Model launches, enterprise integrations, and pricing moves are accelerating competition for developer mindshare and distribution.",
  events: [
    {
      date: "Q1",
      title: "Major model updates expand multimodal workflows",
      detail:
        "Both ecosystems push faster iteration cycles with stronger reasoning, tool-use, and voice/image capabilities.",
    },
    {
      date: "Q2",
      title: "Platform integrations move from demo to default",
      detail:
        "AI assistants become embedded in productivity stacks, search surfaces, and enterprise copilots.",
    },
    {
      date: "Q3",
      title: "Pricing and latency become strategic battlegrounds",
      detail:
        "Teams optimize for cost/performance and reliability, not just benchmark headlines.",
    },
  ],
  why: [
    "The winners of distribution channels can lock in long-term user behavior.",
    "Cost and reliability determine whether AI products scale beyond pilot stages.",
    "Developer ecosystem momentum often compounds into enterprise adoption.",
  ],
  related: [
    "Where enterprise AI spend is shifting this quarter",
    "The product bets defining assistant UX",
    "What benchmark wins mean in production reality",
  ],
};

const GENERIC_STORYLINE: Omit<StorylineData, "title"> = {
  happening: "Context for this developing story is still being built.",
  events: [
    {
      date: "Now",
      title: "Story first detected",
      detail: "Initial reports have been tracked and a storyline thread has been opened.",
    },
    {
      date: "Ongoing",
      title: "Reporting continues to evolve",
      detail: "New facts are still being verified as additional coverage becomes available.",
    },
    {
      date: "Next",
      title: "Additional updates expected",
      detail: "This thread will expand as trusted sources confirm further developments.",
    },
  ],
  why: ["This event may develop further as more verified reporting becomes available."],
  related: ["Related clips will appear here as this storyline develops."],
};

function fromSlug(slug: string): StorylineData {
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
  return {
    ...GENERIC_STORYLINE,
    title: slug
      .split("-")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" "),
  };
}

export default async function StorylinePage({ params }: StorylinePageProps) {
  const { slug } = await params;
  const data = fromSlug(slug);

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-5 pb-12 pt-6 text-zinc-100">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/today" className="inline-block text-sm text-zinc-400 hover:text-zinc-200">
          ← Back
        </Link>

        <section className="mt-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Storyline</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight [font-family:var(--font-syne)]">
            {data.title}
          </h1>
          <p className="mt-2 text-xs text-zinc-500">
            Prototype thread for <span className="text-zinc-400">{slug}</span>.
          </p>
        </section>

        <section
          className="mt-6 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4"
          style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.02) inset" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            What&apos;s Happening
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">{data.happening}</p>
        </section>

        <section className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Timeline
          </p>
          <ol className="mt-4 space-y-5">
            {data.events.map((item, idx) => (
              <li key={`${item.date}-${item.title}`} className="relative pl-6">
                {idx < data.events.length - 1 ? (
                  <span
                    className="absolute left-[8px] top-5 w-px bg-zinc-800"
                    style={{ height: "calc(100% + 16px)" }}
                    aria-hidden
                  />
                ) : null}
                <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-[#c8ff00]" aria-hidden />
                <p className="text-xs text-zinc-500">{item.date}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-100">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{item.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Why This Matters
          </p>
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
        </section>

        <section className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Related Clips
          </p>
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
        </section>
      </div>
    </main>
  );
}
