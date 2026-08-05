import {
  clampImportance,
  editionDayFilter,
  editionDayStart,
  IMPORTANCE_DEFAULT,
} from "@/lib/edition";
import { createClient } from "@/lib/supabase/server";

export type LiveStoryKeyPoint = {
  text: string;
  source: string;
};

export type LiveStoryReportSection = {
  title: string;
  body: string;
};

export type LiveStoryReport = {
  lead: string;
  sections: LiveStoryReportSection[];
};

export type LiveStory = {
  id: string;
  arc_headline: string;
  arc_summary: string;
  arc_storyline: Array<{ date: string; event: string }>;
  arc_key_points: LiveStoryKeyPoint[];
  arc_report: LiveStoryReport | null;
  clip_url: string | null;
  cover_image_url: string | null;
  category: string;
  is_section_hero: boolean;
  importance: number;
  published_at: string | null;
  created_at: string;
  carried_over_at: string | null;
  original_title: string;
  original_link: string;
  source_name: string | null;
};

type StoryRow = {
  id: string;
  arc_headline: string;
  arc_summary: string;
  arc_storyline: unknown;
  arc_key_points: unknown;
  arc_report: unknown;
  clip_url: string | null;
  cover_image_url: string | null;
  category: string;
  is_section_hero: boolean;
  importance: number | null;
  published_at: string | null;
  created_at: string;
  carried_over_at: string | null;
  articles:
    | {
        title: string;
        link: string;
        feeds: { source_name: string | null } | { source_name: string | null }[] | null;
      }
    | {
        title: string;
        link: string;
        feeds: { source_name: string | null } | { source_name: string | null }[] | null;
      }[]
    | null;
};

function parseStoryline(value: unknown): Array<{ date: string; event: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const entry = item as Record<string, unknown>;
      return {
        date: typeof entry.date === "string" ? entry.date : "",
        event: typeof entry.event === "string" ? entry.event : "",
      };
    });
}

function parseKeyPoints(value: unknown): LiveStoryKeyPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const points: LiveStoryKeyPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.text !== "string" || typeof entry.source !== "string") {
      continue;
    }
    points.push({ text: entry.text, source: entry.source });
  }
  return points;
}

function parseReport(value: unknown): LiveStoryReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const report = value as Record<string, unknown>;
  if (typeof report.lead !== "string" || !Array.isArray(report.sections)) {
    return null;
  }

  const sections: LiveStoryReportSection[] = [];
  for (const item of report.sections) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.title !== "string" || typeof entry.body !== "string") {
      continue;
    }
    sections.push({ title: entry.title, body: entry.body });
  }

  return { lead: report.lead, sections };
}

function getArticle(row: StoryRow): {
  title: string;
  link: string;
  feeds: { source_name: string | null } | { source_name: string | null }[] | null;
} | null {
  if (!row.articles) {
    return null;
  }
  return Array.isArray(row.articles) ? row.articles[0] ?? null : row.articles;
}

function getSourceName(
  feeds: { source_name: string | null } | { source_name: string | null }[] | null,
): string | null {
  if (!feeds) {
    return null;
  }
  return Array.isArray(feeds) ? (feeds[0]?.source_name ?? null) : feeds.source_name;
}

function toLiveStory(row: StoryRow): LiveStory {
  const article = getArticle(row);
  return {
    id: row.id,
    arc_headline: row.arc_headline,
    arc_summary: row.arc_summary,
    arc_storyline: parseStoryline(row.arc_storyline),
    arc_key_points: parseKeyPoints(row.arc_key_points),
    arc_report: parseReport(row.arc_report),
    clip_url: row.clip_url,
    cover_image_url: row.cover_image_url,
    category: row.category,
    is_section_hero: Boolean(row.is_section_hero),
    importance: clampImportance(row.importance ?? IMPORTANCE_DEFAULT),
    published_at: row.published_at,
    created_at: row.created_at,
    carried_over_at: row.carried_over_at,
    original_title: article?.title ?? "",
    original_link: article?.link ?? "",
    source_name: getSourceName(article?.feeds ?? null),
  };
}

const STORY_SELECT =
  "id,arc_headline,arc_summary,arc_storyline,arc_key_points,arc_report,clip_url,cover_image_url,category,is_section_hero,importance,published_at,created_at,carried_over_at,articles!stories_article_id_fkey(title,link,feeds(source_name))";

/**
 * Today's edition, in reader order: heaviest first, newest breaking ties. The
 * page lifts each category's hero out of this list before rendering the rest.
 */
export async function getLiveStories(): Promise<LiveStory[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("stories")
      .select(STORY_SELECT)
      .eq("is_live", true)
      .or(editionDayFilter(editionDayStart()))
      .order("importance", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return [];
    }

    return (data as StoryRow[]).map(toLiveStory);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to fetch live stories: ${message}`);
  }
}

/**
 * A single published story, with no edition-day window: permalinks and event
 * timelines keep working after a story leaves the Today page.
 */
export async function getLiveStoryById(id: string): Promise<LiveStory | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("stories")
      .select(STORY_SELECT)
      .eq("id", id)
      .eq("is_live", true)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return null;
    }

    return toLiveStory(data as StoryRow);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to fetch live story by id: ${message}`);
  }
}
