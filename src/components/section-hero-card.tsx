// Tall photo-dominant section lead card for /today (headline + pills overlaid on cover / gradient).

import Image from "next/image";
import Link from "next/link";

import type { LiveStory } from "@/lib/stories";

type Props = {
  story: LiveStory;
  categoryLabel: string;
};

export function SectionHeroCard({ story, categoryLabel }: Props) {
  return (
    <Link
      href={`/today/${story.id}`}
      className="relative block h-[55vh] max-h-[480px] min-h-[360px] w-full overflow-hidden rounded-2xl"
    >
      {story.cover_image_url ? (
        <Image
          src={story.cover_image_url}
          alt={story.arc_headline}
          fill
          unoptimized
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 600px"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(160deg, #1a1a1a 0%, #0a0a0a 100%)",
          }}
        />
      )}

      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: "linear-gradient(transparent 35%, rgba(0,0,0,0.85) 100%)",
        }}
        aria-hidden
      />

      <div className="absolute left-3 right-3 top-3 z-10 flex items-start justify-between gap-2">
        <span
          className="shrink-0 font-bold uppercase text-[#1a1a1a]"
          style={{
            background: "#c8ff00",
            fontSize: "10px",
            letterSpacing: "1px",
            padding: "4px 10px",
            borderRadius: "4px",
          }}
        >
          {categoryLabel.toUpperCase()}
        </span>
        {story.clip_url ? (
          <span
            className="shrink-0 font-semibold text-white"
            style={{
              background: "rgba(0,0,0,0.5)",
              fontSize: "9px",
              padding: "3px 7px",
              borderRadius: "4px",
            }}
          >
            1:02
          </span>
        ) : null}
      </div>

      {story.clip_url ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          aria-hidden
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <svg
              width="14"
              height="16"
              viewBox="0 0 14 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="ml-[3px]"
              aria-hidden
            >
              <path d="M14 8L0 16V0L14 8Z" fill="white" />
            </svg>
          </div>
        </div>
      ) : null}

      <h2
        className="absolute bottom-0 left-0 right-0 z-10 text-lg font-extrabold leading-[1.2] tracking-[-0.3px] text-white"
        style={{ padding: "12px 14px 16px" }}
      >
        {story.arc_headline}
      </h2>
    </Link>
  );
}
