import Link from "next/link";
import { notFound } from "next/navigation";

import { getEventWithStories, type EventStory } from "@/lib/events";

export const dynamic = "force-dynamic";

function formatStoryDate(story: EventStory): string {
  const raw = story.published_at ?? story.created_at;
  if (!raw) {
    return "Undated";
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return "Undated";
  }
  return d.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(status: string): string {
  const s = status.trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getEventWithStories(id);

  if (!data) {
    notFound();
  }

  const { event, stories } = data;
  const showStatus = event.status !== "running";
  const oldestId = stories.length > 0 ? stories[stories.length - 1]!.id : null;

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-100">
      <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-[calc(env(safe-area-inset-top)+28px)]">
        <Link
          href="/today"
          className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
        >
          ← Today
        </Link>

        <header className="mt-6 border-b border-white/5 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 [font-family:var(--font-syne)]">
              Storyline
            </span>
            {showStatus ? (
              <span className="rounded border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                {statusLabel(event.status)}
              </span>
            ) : null}
          </div>

          <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-zinc-50 md:text-3xl">
            {event.title}
          </h1>

          {event.open_question ? (
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {event.open_question}
            </p>
          ) : null}

          <p className="mt-4 text-xs text-zinc-500">
            {stories.length} {stories.length === 1 ? "story" : "stories"}
          </p>
        </header>

        {stories.length === 0 ? (
          <p className="py-16 text-center text-sm text-zinc-500">
            No published stories yet.
          </p>
        ) : (
          <ol className="mt-8 space-y-0">
            {stories.map((story, index) => (
              <li key={story.id} className="relative pl-6">
                <span
                  className="absolute left-0 top-2 h-1.5 w-1.5 rounded-full bg-zinc-600"
                  aria-hidden
                />
                {index < stories.length - 1 ? (
                  <span
                    className="absolute bottom-0 left-[2.5px] top-5 w-px bg-white/8"
                    aria-hidden
                  />
                ) : null}

                <Link href={`/today/${story.id}`} className="group block pb-8">
                  <p className="text-[11px] uppercase tracking-widest text-zinc-500">
                    {formatStoryDate(story)}
                  </p>
                  <h2 className="mt-1.5 text-lg font-medium leading-snug text-zinc-100 group-hover:text-white">
                    {story.arc_headline}
                  </h2>
                  {story.arc_summary ? (
                    <p className="mt-1.5 text-sm leading-6 text-zinc-400">
                      {story.arc_summary}
                    </p>
                  ) : null}
                  {story.id === oldestId && stories.length > 1 ? (
                    <span className="mt-3 inline-block rounded border border-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                      Where it started
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
