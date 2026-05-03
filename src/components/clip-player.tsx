"use client";

import Image from "next/image";
import { useCallback, useRef } from "react";

type Props = {
  clipUrl: string | null;
  coverUrl: string | null;
  headline: string;
  summaryPreview: string;
};

export function ClipPlayer({ clipUrl, coverUrl, headline, summaryPreview }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const syncPausedFromVideo = useCallback(() => {
    void videoRef.current?.paused;
  }, []);

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
    <div className="relative h-screen w-full overflow-hidden bg-[#0a0a0a]">
      {clipUrl ? (
        <video
          ref={videoRef}
          poster={coverUrl ?? undefined}
          className="block h-full w-full cursor-pointer object-cover"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          playsInline
          muted
          autoPlay
          loop
          preload="auto"
          controls={false}
          {...{ "webkit-playsinline": "" }}
          onClick={togglePlayback}
          onPlay={syncPausedFromVideo}
          onPause={syncPausedFromVideo}
        >
          <source src={clipUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
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
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1]"
        style={{
          height: "60%",
          background:
            "linear-gradient(to top, rgba(10,10,10,0.98) 0%, rgba(10,10,10,0.85) 25%, rgba(10,10,10,0.6) 45%, rgba(10,10,10,0.2) 65%, transparent 100%)",
        }}
        aria-hidden
      />

      <h2
        className="pointer-events-none absolute left-0 right-0 z-20 text-lg font-extrabold leading-[1.2] tracking-[-0.3px] text-white"
        style={{ top: "60%", padding: "16px 18px 8px" }}
      >
        {headline}
      </h2>

      <p
        className="pointer-events-none absolute left-0 right-0 z-20 text-[13px] font-normal leading-[1.45] text-white/80"
        style={{
          top: "calc(60% + 70px)",
          padding: "0 18px 24px",
        }}
      >
        {summaryPreview}
      </p>
    </div>
  );
}
