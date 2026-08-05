"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { IMPORTANCE_MAX, IMPORTANCE_MIN } from "@/lib/edition";

export type EditionRowStory = {
  id: string;
  headline: string;
  importance: number;
  is_section_hero: boolean;
  carried_over: boolean;
};

const IMPORTANCE_LEVELS = Array.from(
  { length: IMPORTANCE_MAX - IMPORTANCE_MIN + 1 },
  (_, index) => IMPORTANCE_MIN + index,
);

async function patchStory(id: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/arc/stories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(typeof data.error === "string" ? data.error : "Update failed");
  }
}

function ImportancePicker({
  storyId,
  value,
  onError,
}: {
  storyId: string;
  value: number;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);
  const [optimistic, setOptimistic] = useState(value);

  const setImportance = async (next: number) => {
    if (next === optimistic) return;
    setPending(next);
    onError(null);
    const previous = optimistic;
    setOptimistic(next);
    try {
      await patchStory(storyId, { importance: next });
      router.refresh();
    } catch (err: unknown) {
      setOptimistic(previous);
      onError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      role="group"
      aria-label="Importance"
      className="flex items-center gap-0.5"
    >
      {IMPORTANCE_LEVELS.map((level) => {
        const active = level === optimistic;
        return (
          <button
            key={level}
            type="button"
            aria-pressed={active}
            aria-label={`Set importance ${level}`}
            disabled={pending !== null}
            onClick={() => setImportance(level)}
            className={`h-7 w-7 rounded text-xs font-semibold transition-colors disabled:opacity-50 ${
              active
                ? "bg-[#c8ff00] text-black"
                : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}

export function EditionRow({ story }: { story: EditionRowStory }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-zinc-900 py-2.5 last:border-b-0">
      <ImportancePicker
        storyId={story.id}
        value={story.importance}
        onError={setError}
      />

      <Link
        href={`/admin/${story.id}`}
        className="min-w-0 flex-1 text-sm text-zinc-100 hover:text-[#c8ff00]"
      >
        {story.headline}
      </Link>

      {story.is_section_hero ? (
        <span className="rounded-full bg-[#c8ff00] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
          Hero
        </span>
      ) : null}

      {story.carried_over ? (
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
          Carried
        </span>
      ) : null}

      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </li>
  );
}

export function CarryOverRow({
  story,
  categoryLabel,
}: {
  story: { id: string; headline: string };
  categoryLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keepInToday = async () => {
    setPending(true);
    setError(null);
    try {
      await patchStory(story.id, { carried_over: true });
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
      setPending(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-zinc-900 py-2.5 last:border-b-0">
      <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-zinc-500">
        {categoryLabel}
      </span>

      <Link
        href={`/admin/${story.id}`}
        className="min-w-0 flex-1 text-sm text-zinc-300 hover:text-[#c8ff00]"
      >
        {story.headline}
      </Link>

      {error ? <span className="text-xs text-red-400">{error}</span> : null}

      <button
        type="button"
        onClick={keepInToday}
        disabled={pending}
        className="rounded-full border border-[#c8ff00] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#c8ff00] transition-colors hover:bg-[#c8ff00] hover:text-black disabled:opacity-50"
      >
        {pending ? "Keeping…" : "Keep in today"}
      </button>
    </li>
  );
}
