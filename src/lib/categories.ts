import type { LiveStory } from "@/lib/stories";

export const CANONICAL_CATEGORY_ORDER = [
  "World",
  "India",
  "Finance",
  "Tech",
  "Sports",
  "Local",
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORY_ORDER)[number];
export type StoryCategoryBucket = CanonicalCategory | "Other";

/** Maps raw DB category strings (case-insensitive) to canonical buckets. */
export function normalizeStoryCategory(raw: string): StoryCategoryBucket {
  const k = raw.trim().toLowerCase();

  if (k === "world" || k === "politics" || k === "geopolitics") {
    return "World";
  }
  if (k === "india") {
    return "India";
  }
  if (k === "economy" || k === "finance" || k === "business") {
    return "Finance";
  }
  if (k === "tech" || k === "technology" || k === "science") {
    return "Tech";
  }
  if (k === "sports" || k === "sport") {
    return "Sports";
  }
  if (k === "local") {
    return "Local";
  }

  return "Other";
}

/** Admin + API: allowed `stories.category` values (lowercase). */
export const CATEGORY_DROPDOWN_OPTIONS = [
  { value: "world", label: "Geopolitics" },
  { value: "india", label: "India" },
  { value: "finance", label: "Finance" },
  { value: "tech", label: "Tech" },
  { value: "sports", label: "Sports" },
  { value: "local", label: "Local" },
] as const;

export type StoryCategoryDbValue = (typeof CATEGORY_DROPDOWN_OPTIONS)[number]["value"];

export function isAllowedStoryCategoryDbValue(value: string): value is StoryCategoryDbValue {
  return CATEGORY_DROPDOWN_OPTIONS.some((o) => o.value === value);
}

/**
 * Maps a normalized canonical category back to its lowercase DB value (inverse of the
 * normalizer for canonical buckets only). Unknown input normalizes via `normalizeStoryCategory`
 * first; `Other` maps to `world`.
 */
export function canonicalCategoryToDbValue(canonical: string): StoryCategoryDbValue {
  const bucket = normalizeStoryCategory(canonical);
  switch (bucket) {
    case "World":
      return "world";
    case "India":
      return "india";
    case "Finance":
      return "finance";
    case "Tech":
      return "tech";
    case "Sports":
      return "sports";
    case "Local":
      return "local";
    case "Other":
    default:
      return "world";
  }
}

export function categorySectionId(name: StoryCategoryBucket): string {
  const slug = name === "Other" ? "other" : name.toLowerCase();
  return `section-${slug}`;
}

/** Picks the section lead: explicit `is_section_hero`, else newest (first in list), else null. */
export function findSectionHero(stories: LiveStory[]): LiveStory | null {
  if (stories.length === 0) {
    return null;
  }
  const flagged = stories.find((s) => s.is_section_hero === true);
  if (flagged) {
    return flagged;
  }
  return stories[0] ?? null;
}
