/**
 * Persisted verification shape on stories.verification, plus the parsers and
 * publishability rules Genre Review and the admin panels share.
 */

export type VerificationReason =
  | "not_in_source"
  | "contradicts_source"
  | "overstated";

export type VerificationFlag = {
  claim: string;
  reason: VerificationReason;
  note: string;
};

export type Verification = {
  claims_checked: number;
  flags: VerificationFlag[];
};

/** Parse the jsonb column defensively — older rows predate the verification pass. */
export function parseVerification(value: unknown): Verification | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const obj = value as Record<string, unknown>;

  const flags: VerificationFlag[] = [];
  const flagsRaw = Array.isArray(obj.flags) ? obj.flags : [];
  for (const item of flagsRaw) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const claim = typeof f.claim === "string" ? f.claim.trim() : "";
    const reason =
      f.reason === "not_in_source" ||
      f.reason === "contradicts_source" ||
      f.reason === "overstated"
        ? f.reason
        : null;
    if (!claim || !reason) continue;
    flags.push({
      claim,
      reason,
      note: typeof f.note === "string" ? f.note.trim() : "",
    });
  }

  const checked =
    typeof obj.claims_checked === "number" ? Math.round(obj.claims_checked) : 0;

  return { claims_checked: Math.max(0, checked), flags };
}

/** A story may go live only after a verification pass that raised zero flags. */
export function isPublishableVerification(
  verification: Verification | null,
): boolean {
  return verification !== null && verification.flags.length === 0;
}

export function isFlaggedVerification(
  verification: Verification | null,
): boolean {
  return verification !== null && verification.flags.length > 0;
}

export function isUnverified(verification: Verification | null): boolean {
  return verification === null;
}
