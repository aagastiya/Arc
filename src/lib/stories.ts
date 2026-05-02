import { createClient } from "@/lib/supabase/server";

export type LiveStory = {
  id: string;
  arc_headline: string;
  arc_summary: string;
  arc_storyline: Array<{ date: string; event: string }>;
  clip_url: string | null;
  cover_image_url: string | null;
  category: string;
  published_at: string | null;
  original_title: string;
  original_link: string;
  source_name: string | null;
};

type StoryRow = {
  id: string;
  arc_headline: string;
  arc_summary: string;
  arc_storyline: unknown;
  clip_url: string | null;
  cover_image_url: string | null;
  category: string;
  published_at: string | null;
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
    clip_url: row.clip_url,
    cover_image_url: row.cover_image_url,
    category: row.category,
    published_at: row.published_at,
    original_title: article?.title ?? "",
    original_link: article?.link ?? "",
    source_name: getSourceName(article?.feeds ?? null),
  };
}

export async function getLiveStories(): Promise<LiveStory[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id,arc_headline,arc_summary,arc_storyline,clip_url,cover_image_url,category,published_at,articles(title,link,feeds(source_name))",
      )
      .eq("is_live", true)
      .order("published_at", { ascending: false, nullsFirst: false })
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

export async function getLiveStoryById(id: string): Promise<LiveStory | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("stories")
      .select(
        "id,arc_headline,arc_summary,arc_storyline,clip_url,cover_image_url,category,published_at,articles(title,link,feeds(source_name))",
      )
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
