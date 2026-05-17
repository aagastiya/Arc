"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StorySlide = {
  id: string;
  clipUrl: string | null;
  coverUrl: string | null;
  headline: string;
  summaryPreview: string;
  category: string | null;
};

type Props = {
  allStories: StorySlide[];
  currentIndex: number;
};

export function ClipPlayer({ allStories, currentIndex }: Props) {
  const router = useRouter();
  const swipeContainerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const activeIndexRef = useRef(currentIndex);
  const storiesRef = useRef<StorySlide[]>([]);

  const stories = useMemo(() => allStories, [allStories]);

  const [activeIndex, setActiveIndex] = useState(currentIndex);
  const [coverHiddenByIndex, setCoverHiddenByIndex] = useState<Record<number, boolean>>({});

  const hideCoverForIndex = useCallback((idx: number) => {
    setCoverHiddenByIndex((prev) => (prev[idx] ? prev : { ...prev, [idx]: true }));
  }, []);

  activeIndexRef.current = activeIndex;
  storiesRef.current = stories;

  useEffect(() => {
    setActiveIndex(currentIndex);
  }, [currentIndex]);

  useEffect(() => {
    const story = stories[activeIndex];
    if (story?.id) {
      window.history.replaceState(null, "", `/today/${story.id}`);
    }
  }, [activeIndex, stories]);

  useEffect(() => {
    videoRefs.current.forEach((el, i) => {
      if (!el) {
        return;
      }
      if (i === activeIndex) {
        void el.play().catch(() => {});
        if (!el.paused && el.currentTime > 0) {
          hideCoverForIndex(i);
        }
      } else {
        el.pause();
      }
    });
  }, [activeIndex, hideCoverForIndex, stories.length]);

  const syncPausedFromVideo = useCallback(() => {
    const el = videoRefs.current[activeIndexRef.current];
    void el?.paused;
  }, []);

  const togglePlayback = useCallback(() => {
    const el = videoRefs.current[activeIndexRef.current];
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
      const idx = activeIndexRef.current;
      const storyList = storiesRef.current;
      const lastIdx = storyList.length - 1;
      console.log("touch end", { deltaX, deltaY, activeIndex: idx });
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
        if (idx < lastIdx) {
          console.log("swipe left -> next");
          setActiveIndex(idx + 1);
        } else {
          console.log("swipe left -> informed");
          router.push("/today/informed");
        }
        return;
      }

      if (idx > 0) {
        console.log("swipe right -> prev");
        setActiveIndex(idx - 1);
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
  }, [router, togglePlayback]);

  const categoryLabel = stories[activeIndex]?.category;

  return (
    <motion.div
      ref={swipeContainerRef}
      className="relative h-[100dvh] min-h-[100svh] w-full shrink-0 overflow-hidden bg-[#0a0a0a]"
      style={{ touchAction: "pan-y", WebkitUserSelect: "none", userSelect: "none" }}
    >
      <Link
        href="/today"
        aria-label="Back to Today"
        className="absolute left-4 top-[calc(env(safe-area-inset-top)+16px)] z-50 inline-flex min-h-11 min-w-11 items-center justify-center p-2.5 text-zinc-300/70 transition-opacity hover:opacity-100 hover:text-zinc-100"
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

      {categoryLabel ? (
        <div
          className="pointer-events-none absolute left-0 right-0 top-[calc(env(safe-area-inset-top)+12px)] z-40 flex w-full items-center gap-2"
          style={{ padding: "14px 16px 14px 56px" }}
        >
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
        </div>
      ) : null}

      <motion.div
        animate={{ x: `-${activeIndex * 100}vw` }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{ display: "flex", height: "100%" }}
      >
        {stories.map((story, idx) => (
          <div
            key={story.id}
            style={{ width: "100vw", height: "100%", flexShrink: 0, position: "relative" }}
          >
            {story.clipUrl ? (
              <>
                <video
                  ref={(el) => {
                    videoRefs.current[idx] = el;
                  }}
                  poster={story.coverUrl ?? undefined}
                  className="absolute inset-0 z-0 block h-full w-full cursor-pointer object-cover"
                  playsInline
                  muted
                  autoPlay={idx === activeIndex}
                  loop
                  preload="auto"
                  controls={false}
                  {...{ "webkit-playsinline": "" }}
                  onPlaying={() => {
                    hideCoverForIndex(idx);
                    syncPausedFromVideo();
                  }}
                  onPlay={syncPausedFromVideo}
                  onPause={syncPausedFromVideo}
                >
                  <source src={story.clipUrl} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                {story.coverUrl ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-200 ease-out"
                    style={{ opacity: coverHiddenByIndex[idx] ? 0 : 1 }}
                    aria-hidden
                  >
                    <Image
                      src={story.coverUrl}
                      alt=""
                      fill
                      unoptimized
                      priority={idx === activeIndex}
                      className="object-cover"
                      sizes="100vw"
                    />
                  </div>
                ) : null}
              </>
            ) : story.coverUrl ? (
              <div className="absolute inset-0">
                <Image
                  src={story.coverUrl}
                  alt={story.headline}
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
                {story.headline}
              </h2>
              <p className="mt-2 line-clamp-2 text-[11px] font-normal leading-[1.5] text-white/70 sm:text-xs">
                {story.summaryPreview}
              </p>
            </div>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
