import type {
  Verification,
  VerificationFlag,
  VerificationReason,
} from "@/lib/arc/verification";
import {
  isFlaggedVerification,
  isPublishableVerification,
  isUnverified,
  parseVerification,
} from "@/lib/arc/verification";

export type {
  Verification,
  VerificationFlag,
  VerificationReason,
};

export {
  isFlaggedVerification,
  isPublishableVerification,
  isUnverified,
  parseVerification,
};

const REASON_LABELS: Record<VerificationReason, string> = {
  not_in_source: "Not in source",
  contradicts_source: "Contradicts source",
  overstated: "Overstated",
};

/** Admin-only fact-check summary. Never rendered on reader pages. */
export function VerificationPanel({
  verification,
}: {
  verification: Verification | null;
}) {
  if (!verification) {
    return (
      <section className="mt-6 rounded-lg border border-zinc-800 bg-[var(--card)] p-5">
        <h2 className="text-xl font-semibold text-zinc-100">Verification</h2>
        <p className="mt-3 text-sm text-zinc-500">
          No verification run for this story yet. Regenerate it to check its
          claims against the sources.
        </p>
      </section>
    );
  }

  const { claims_checked: checked, flags } = verification;

  if (flags.length === 0) {
    return (
      <section className="mt-6 rounded-lg border border-zinc-800 bg-[var(--card)] p-5">
        <h2 className="text-xl font-semibold text-zinc-100">Verification</h2>
        <p className="mt-3 text-sm text-emerald-400">
          All {checked} {checked === 1 ? "claim" : "claims"} verified against
          sources.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-zinc-100">Verification</h2>
        <span className="text-sm text-amber-300">
          {flags.length} of {checked} {checked === 1 ? "claim" : "claims"} need
          review
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {flags.map((flag, index) => (
          <li
            key={`${flag.reason}:${index}`}
            className="rounded-md border border-amber-500/20 bg-black/20 p-3"
          >
            <div className="flex flex-wrap items-start gap-2">
              <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                {REASON_LABELS[flag.reason]}
              </span>
              <p className="min-w-0 flex-1 text-sm leading-6 text-zinc-100">
                {`"${flag.claim}"`}
              </p>
            </div>
            {flag.note ? (
              <p className="mt-2 text-sm leading-6 text-zinc-400">{flag.note}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
