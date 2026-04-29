"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type GenerateArcButtonProps = {
  articleId: string;
  hasDraft: boolean;
};

export function GenerateArcButton({ articleId, hasDraft }: GenerateArcButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/arc/generate?id=${encodeURIComponent(articleId)}`,
        { method: "POST" },
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to generate Arc voice draft.";
        throw new Error(message);
      }

      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="rounded border border-[#c8ff00]/50 px-3 py-1 text-xs font-semibold text-[#c8ff00] transition hover:border-[#c8ff00] hover:bg-[#c8ff00]/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "Generating..." : hasDraft ? "Regenerate" : "Generate Arc voice"}
      </button>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
