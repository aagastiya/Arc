"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

type Props = {
  clipUrl: string | null;
  coverUrl: string | null;
  headline: string;
  summaryPreview: string;
  prevStoryId: string | null;
  nextStoryId: string | null;
};

export function ClipPlayer({
  clipUrl,
  coverUrl,
  headline,
  summaryPreview,
  prevStoryId,
  nextStoryId,
}: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const swipeContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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

  useEffect(() => {
    const isInsideClipBounds = (x: number, y: number) => {
      const rect = swipeContainerRef.current?.getBoundingClientRect();
      if (!rect) {
        return false;
      }
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch || !isInsideClipBounds(touch.clientX, touch.clientY)) {
        return;
      }
      console.log("touch start", { x: touch.clientX, y: touch.clientY });
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch || !isInsideClipBounds(touch.clientX, touch.clientY)) {
        return;
      }

      const start = touchStartRef.current;
      if (!start) {
        return;
      }

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      console.log("touch end", { deltaX, deltaY, prevStoryId, nextStoryId });
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX <= 50 && absY <= 50) {
        togglePlayback();
        return;
      }

      if (absX <= 50 || absX <= absY) {
        return;
      }

      if (deltaX < 0) {
        if (nextStoryId) {
          console.log("swipe left -> next");
          router.push(`/today/${nextStoryId}`);
        } else {
          console.log("swipe left -> informed");
          router.push("/today/informed");
        }
        return;
      }

      if (prevStoryId) {
        console.log("swipe right -> prev");
        router.push(`/today/${prevStoryId}`);
      }
    };

    document.addEventListener("touchstart", handleTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchend", handleTouchEnd, { capture: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart, true);
      document.removeEventListener("touchend", handleTouchEnd, true);
    };
  }, [nextStoryId, prevStoryId, router, togglePlayback]);

  return (
    <div
      ref={swipeContainerRef}
      className="relative h-screen w-full overflow-hidden bg-[#0a0a0a]"
      style={{ touchAction: "pan-y" }}
    >
      {clipUrl ? (
        <>
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
            onPlay={syncPausedFromVideo}
            onPause={syncPausedFromVideo}
          >
            <source src={clipUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          <div ref={overlayRef} className="absolute inset-0 z-30 bg-transparent" />
        </>
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
        className="pointer-events-none absolute left-0 right-0 z-40 text-lg font-extrabold leading-[1.2] tracking-[-0.3px] text-white"
        style={{ top: "60%", padding: "16px 18px 8px" }}
      >
        {headline}
      </h2>

      <p
        className="pointer-events-none absolute left-0 right-0 z-40 text-[13px] font-normal leading-[1.45] text-white/80"
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
