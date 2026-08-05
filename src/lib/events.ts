import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ArcEvent = {
  id: string;
  title: string;
  open_question: string;
  status: string;
};

export type EventStory = {
  id: string;
  arc_headline: string;
  arc_summary: string;
  category: string | null;
  published_at: string | null;
  created_at: string | null;
};

export type EventWithStories = {
  event: ArcEvent;
  stories: EventStory[];
};

export type StoryEventChip = {
  id: string;
  title: string;
  storyCount: number;
};

type SupabaseAnonClient = Awaited<ReturnType<typeof createClient>>;

type StoryEmbed = {
  id: string;
  arc_headline: string;
  arc_summary: string;
  category: string | null;
  published_at: string | null;
  created_at: string | null;
};

export function isEventId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

function firstEmbed<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Sort key: published time when set, else row creation time. */
function storyTime(story: EventStory): number {
  const raw = story.published_at ?? story.created_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Stories on an event, newest first. RLS limits this to approved links on
 * published stories, so drafts never leak to readers.
 */
async function fetchEventStories(
  supabase: SupabaseAnonClient,
  eventId: string,
): Promise<EventStory[]> {
  const { data, error } = await supabase
    .from("story_events")
    .select(
      "story_id,stories!inner(id,arc_headline,arc_summary,category,published_at,created_at)",
    )
    .eq("event_id", eventId)
    .eq("approved", true);

  if (error) {
    throw new Error(`Failed to fetch event stories: ${error.message}`);
  }

  const stories: EventStory[] = [];
  for (const row of data ?? []) {
    const embed = firstEmbed(
      (row as { stories: StoryEmbed | StoryEmbed[] | null }).stories,
    );
    if (!embed) continue;
    stories.push({
      id: embed.id,
      arc_headline: embed.arc_headline,
      arc_summary: embed.arc_summary,
      category: embed.category,
      published_at: embed.published_at,
      created_at: embed.created_at,
    });
  }

  return stories.sort((a, b) => storyTime(b) - storyTime(a));
}

/** Event plus its published stories, or null when the id is unknown/hidden. */
export async function getEventWithStories(
  id: string,
): Promise<EventWithStories | null> {
  if (!isEventId(id)) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { data: event, error } = await supabase
      .from("events")
      .select("id,title,open_question,status")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (!event) {
      return null;
    }

    const stories = await fetchEventStories(supabase, event.id as string);

    return {
      event: {
        id: event.id as string,
        title: (event.title as string) ?? "",
        open_question: (event.open_question as string) ?? "",
        status: (event.status as string) ?? "running",
      },
      stories,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to fetch event: ${message}`);
  }
}

/** Approved event a story belongs to, for the reader-facing chip. */
export async function getStoryEventChip(
  storyId: string,
): Promise<StoryEventChip | null> {
  if (!isEventId(storyId)) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("story_events")
      .select("event_id,events!inner(id,title)")
      .eq("story_id", storyId)
      .eq("approved", true)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    const row = (data ?? [])[0];
    if (!row) {
      return null;
    }

    const event = firstEmbed(
      (row as { events: { id: string; title: string } | { id: string; title: string }[] | null })
        .events,
    );
    if (!event) {
      return null;
    }

    const stories = await fetchEventStories(supabase, event.id);

    return {
      id: event.id,
      title: event.title ?? "",
      storyCount: stories.length,
    };
  } catch {
    // The chip is decoration — never break the story page over it.
    return null;
  }
}
