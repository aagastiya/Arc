"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

type CategoryStory = {
  id: string;
  clipUrl: string | null;
  coverUrl: string | null;
  headline: string;
  summaryPreview: string;
};

type Props = {
  // Current story fields (kept for rendering; will be retired in commit 4)
  clipUrl: string | null;
  coverUrl: string | null;
  headline: string;
  summaryPreview: string;
  prevStoryId: string | null;
  nextStoryId: string | null;
  // New: full list of stories in the same category + this story's position
  categoryStories: CategoryStory[];
  currentIndex: number;
};

export function ClipPlayer({
  clipUrl,
  coverUrl,
  headline,
  summaryPreview,
  prevStoryId,
  nextStoryId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  categoryStories: _categoryStories,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  currentIndex: _currentIndex,
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

      if (absX <= 50 || absX < absY * 1.5) {
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
    <motion.div
      ref={swipeContainerRef}
      className="relative h-[100dvh] min-h-[100svh] w-full shrink-0 overflow-hidden bg-[#0a0a0a]"
      style={{ touchAction: "pan-y", WebkitUserSelect: "none", userSelect: "none" }}
    >
      <Link
        href="/today"
        aria-label="Back to Today"
        className="absolute left-4 top-4 z-50 inline-flex min-h-11 min-w-11 items-center justify-center p-2.5 text-zinc-300/70 transition-opacity hover:opacity-100 hover:text-zinc-100"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>

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

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex h-[40%] flex-col justify-end bg-gradient-to-t from-black/85 to-transparent px-4 pb-4">
        <h2 className="line-clamp-3 text-xl font-medium leading-[1.15] tracking-tight text-white sm:text-[22px]">
          {headline}
        </h2>
        <p className="mt-2 line-clamp-2 text-[11px] font-normal leading-[1.5] text-white/70 sm:text-xs">
          {summaryPreview}
        </p>
      </div>
    </motion.div>
  );
}
