type ArcWordmarkProps = {
  size?: "sm" | "md" | "lg";
};

const sizeClass = {
  sm: "text-[20px]",
  md: "text-[28px]",
  lg: "text-[48px]",
} as const;

/**
 * Editorial wordmark: “Arc” in Sora (heavy) + small lime square with soft glow.
 * Square scale ~35% of text cap height via em; baseline-aligned like a period.
 */
export function ArcWordmark({ size = "md" }: ArcWordmarkProps) {
  return (
    <span
      className={`inline-flex items-baseline gap-[0.14em] leading-none ${sizeClass[size]}`}
    >
      <span className="font-extrabold text-white [font-family:var(--font-sora)]">Arc</span>
      <span
        className="inline-block h-[0.35em] w-[0.35em] shrink-0 bg-[#c8ff00] shadow-[0_0_10px_4px_rgba(200,255,0,0.28)]"
        aria-hidden
      />
    </span>
  );
}
