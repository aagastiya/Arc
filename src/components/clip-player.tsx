"use client";

import Image from "next/image";
import { useCallback, useRef } from "react";

type Props = {
  clipUrl: string | null;
  coverUrl: string | null;
  headline: string;
};

export function ClipPlayer({ clipUrl, coverUrl, headline }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlayback = useCallback(() => {
    const el = videoRef.current;
    if (!el) {
      return;
    }
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }, []);

  return (
    <div className="relative h-[55vh] w-full overflow-hidden bg-black">
      {clipUrl ? (
        <video
          ref={videoRef}
          src={clipUrl}
          poster={coverUrl ?? undefined}
          playsInline
          preload="metadata"
          controls={false}
          className="absolute inset-0 h-full w-full cursor-pointer object-cover"
          onClick={togglePlayback}
        />
      ) : coverUrl ? (
        <div className="absolute inset-0">
          <Image
            src={coverUrl}
            alt={headline}
            fill
            unoptimized
            className="object-cover"
            sizes="100vw"
          />
        </div>
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
          background: "linear-gradient(transparent 30%, rgba(0,0,0,0.85) 100%)",
        }}
        aria-hidden
      />

      <h2
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 text-lg font-extrabold leading-[1.2] tracking-[-0.3px] text-white"
        style={{ padding: "12px 16px 14px" }}
      >
        {headline}
      </h2>
    </div>
  );
}
