"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ArcWordmark } from "@/components/arc-wordmark";
import {
  CANONICAL_CATEGORY_ORDER,
  categorySectionId,
  type CanonicalCategory,
} from "@/lib/categories";
import {
  DELHI_FALLBACK_COORDS,
  formatDatePill,
  getGreeting,
  weatherIconForCondition,
} from "@/lib/feed-header";

// Set NEXT_PUBLIC_OPENWEATHER_API_KEY in .env.local and Vercel env vars (openweathermap.org).
const OPENWEATHER_API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;

/** Natural height of the greeting-only row (text-sm line + spacing). */
const GREETING_ROW_EXPANDED_PX = 40;
/** Natural width for weather text e.g. "41° ☀️". */
const WEATHER_EXPANDED_PX = 80;

type WeatherState = {
  temp: number;
  icon: string;
} | null;

type Props = {
  showCategoryNav: boolean;
};

export function TodayFeedHeader({ showCategoryNav }: Props) {
  const [activeCategory, setActiveCategory] = useState<CanonicalCategory>(
    CANONICAL_CATEGORY_ORDER[0]!,
  );
  const [weather, setWeather] = useState<WeatherState>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [scrollY, setScrollY] = useState(0);

  const greetingLine = useMemo(() => {
    // TODO: replace "Augy" with authenticated user's name when auth is shipped
    return `${getGreeting()}, Augy`;
  }, []);

  const datePill = useMemo(() => formatDatePill(), []);

  const scrollToCategory = useCallback((name: CanonicalCategory) => {
    document.getElementById(categorySectionId(name))?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const collapseProgress = Math.max(0, Math.min(1, scrollY / 100));
  const fadeOpacity = 1 - collapseProgress;
  const expanded = 1 - collapseProgress;

  const weatherCollapseStyle = {
    opacity: fadeOpacity,
    maxWidth: `${expanded * WEATHER_EXPANDED_PX}px`,
    overflow: "hidden" as const,
    whiteSpace: "nowrap" as const,
    transition: "opacity 100ms ease-out, max-width 100ms ease-out",
    pointerEvents: (fadeOpacity === 0 ? "none" : "auto") as "none" | "auto",
  };

  const greetingRowCollapseStyle = {
    maxHeight: `${expanded * GREETING_ROW_EXPANDED_PX}px`,
    marginTop: `${expanded * 16}px`,
    opacity: fadeOpacity,
    overflow: "hidden" as const,
    transition:
      "max-height 100ms ease-out, margin-top 100ms ease-out, opacity 100ms ease-out",
    pointerEvents: (fadeOpacity === 0 ? "none" : "auto") as "none" | "auto",
  };

  useEffect(() => {
    if (!OPENWEATHER_API_KEY) {
      setWeatherLoading(false);
      return;
    }

    let cancelled = false;

    const loadWeather = async (lat: number, lon: number) => {
      try {
        const url = new URL("https://api.openweathermap.org/data/2.5/weather");
        url.searchParams.set("lat", String(lat));
        url.searchParams.set("lon", String(lon));
        url.searchParams.set("units", "metric");
        url.searchParams.set("appid", OPENWEATHER_API_KEY);

        const res = await fetch(url.toString());
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as {
          main?: { temp?: number };
          weather?: { main?: string }[];
        };
        const temp = data.main?.temp;
        const condition = data.weather?.[0]?.main ?? "Clear";
        if (typeof temp === "number" && !cancelled) {
          setWeather({
            temp: Math.round(temp),
            icon: weatherIconForCondition(condition),
          });
        }
      } catch {
        // keep placeholder on error
      } finally {
        if (!cancelled) {
          setWeatherLoading(false);
        }
      }
    };

    const onPosition = (lat: number, lon: number) => {
      void loadWeather(lat, lon);
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => onPosition(pos.coords.latitude, pos.coords.longitude),
        () => onPosition(DELHI_FALLBACK_COORDS.lat, DELHI_FALLBACK_COORDS.lon),
        { timeout: 10_000, maximumAge: 300_000 },
      );
    } else {
      onPosition(DELHI_FALLBACK_COORDS.lat, DELHI_FALLBACK_COORDS.lon);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showCategoryNav) {
      return;
    }

    const sectionEls = CANONICAL_CATEGORY_ORDER.map((name) =>
      document.getElementById(categorySectionId(name)),
    ).filter((el): el is HTMLElement => el !== null);

    if (sectionEls.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) {
          return;
        }
        const topmost = visible.sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
        )[0];
        if (!topmost) {
          return;
        }
        const match = CANONICAL_CATEGORY_ORDER.find(
          (name) => categorySectionId(name) === topmost.target.id,
        );
        if (match) {
          setActiveCategory(match);
        }
      },
      { root: null, rootMargin: "-15% 0px -55% 0px", threshold: 0 },
    );

    for (const el of sectionEls) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [showCategoryNav]);

  const weatherDisplay = weatherLoading
    ? "—°"
    : weather
      ? `${weather.temp}° ${weather.icon}`
      : "—°";

  return (
    <header
      className="sticky top-0 z-20 bg-[var(--background)]/95 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-6 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 shrink-0 leading-none">
            <ArcWordmark size="md" />
          </h1>
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <span
              className="text-sm tabular-nums text-zinc-300"
              aria-live="polite"
              style={weatherCollapseStyle}
            >
              {weatherDisplay}
            </span>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-zinc-300">
              {datePill}
            </span>
          </div>
        </div>

        <div style={greetingRowCollapseStyle}>
          <p className="text-sm text-zinc-400">{greetingLine}</p>
        </div>
      </div>

      <div className="h-px w-full bg-white/[0.08]" aria-hidden />

      {showCategoryNav ? (
        <>
          <nav aria-label="Story categories" className="mx-auto w-full max-w-6xl px-6">
            <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {CANONICAL_CATEGORY_ORDER.map((label) => {
                const active = activeCategory === label;
                return (
                  <li key={label} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => scrollToCategory(label)}
                      className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                        active
                          ? "text-[#c8ff00]"
                          : "text-zinc-300 hover:text-white"
                      }`}
                      aria-current={active ? "true" : undefined}
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="h-px w-full bg-white/[0.08]" aria-hidden />
        </>
      ) : null}
    </header>
  );
}
