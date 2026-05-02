// Photo-dominant mini card for the 2-column grid below each section hero on /today.

import Image from "next/image";
import Link from "next/link";

import type { LiveStory } from "@/lib/stories";

type Props = {
  story: LiveStory;
  categoryLabel: string;
};

export function SectionMiniCard({ story, categoryLabel }: Props) {
  return (
    <Link
      href={`/today/${story.id}`}
      className="relative block h-[150px] w-full overflow-hidden rounded-xl"
    >
      {story.cover_image_url ? (
        <Image
          src={story.cover_image_url}
          alt={story.arc_headline}
          fill
          unoptimized
          className="object-cover"
          sizes="(max-width: 768px) 50vw, 300px"
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
          background: "linear-gradient(transparent 50%, rgba(0,0,0,0.85) 100%)",
        }}
        aria-hidden
      />

      <span
        className="absolute left-2 top-2 z-10 font-bold uppercase text-[#1a1a1a]"
        style={{
          background: "#c8ff00",
          fontSize: "8px",
          letterSpacing: "0.5px",
          padding: "2px 6px",
          borderRadius: "4px",
        }}
      >
        {categoryLabel.toUpperCase()}
      </span>

      <h3
        className="absolute bottom-0 left-0 right-0 z-10 line-clamp-2 font-bold leading-[1.2] text-white"
        style={{ fontSize: "12px", padding: "8px 6px" }}
      >
        {story.arc_headline}
      </h3>
    </Link>
  );
}
