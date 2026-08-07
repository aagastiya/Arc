"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Verification } from "@/lib/arc/verification";
import { isFlaggedVerification } from "@/lib/arc/verification";

type Props = {
  storyId: string;
  isLive: boolean;
  verification: Verification | null;
  archived: boolean;
};

/**
 * Individual publish override — lives only on /admin/[id].
 * May publish through verification flags after an explicit confirm.
 */
export function PublishOverride({
  storyId,
  isLive,
  verification,
  archived,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flagged = isFlaggedVerification(verification);
  const flagCount = verification?.flags.length ?? 0;

  const run = async (live: boolean) => {
    setPending(true);
    setError(null);
    setConfirming(false);
    try {
      const res = await fetch(
        `/api/admin/stories/${encodeURIComponent(storyId)}/publish`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ live }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : live
              ? "Publish failed"
              : "Unpublish failed",
        );
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  };

  const onPublishClick = () => {
    if (flagged && !confirming) {
      setConfirming(true);
      return;
    }
    void run(true);
  };

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">
            {isLive ? "Live on Today" : "Draft"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Individual override — works even with verification flags. Batch
            Genre Review still refuses flagged stories.
          </p>
        </div>

        {isLive ? (
          <button
            type="button"
            onClick={() => void run(false)}
            disabled={pending}
            className="rounded-full border border-zinc-600 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-200 transition-colors hover:border-zinc-400 disabled:opacity-50"
          >
            {pending ? "Unpublishing…" : "Unpublish"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onPublishClick}
            disabled={pending || archived}
            title={archived ? "Unarchive before publishing" : undefined}
            className="rounded-full border border-[#c8ff00] bg-[#c8ff00]/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#c8ff00] transition-colors hover:bg-[#c8ff00] hover:text-black disabled:opacity-50"
          >
            {pending ? "Publishing…" : "Publish now"}
          </button>
        )}
      </div>

      {!isLive && flagged ? (
        <p className="mt-3 text-xs text-amber-300">
          {flagCount} verification flag{flagCount === 1 ? "" : "s"}
          {confirming ? "" : " — confirm to publish anyway"}
        </p>
      ) : null}

      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
          <p className="flex-1 text-sm text-amber-100">
            This story has {flagCount} verification flag
            {flagCount === 1 ? "" : "s"}. Publish anyway?
          </p>
          <button
            type="button"
            onClick={() => void run(true)}
            disabled={pending}
            className="rounded-full border border-amber-400 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-100 hover:bg-amber-400 hover:text-black disabled:opacity-50"
          >
            {pending ? "Publishing…" : "Publish anyway"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-full border border-zinc-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
