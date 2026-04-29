/**
 * Default RSS sources. Category slugs power tab filters on the home feed.
 * Add or remove entries, then run POST /api/rss/sync to ingest.
 */
export type FeedCategorySlug =
  | "today"
  | "world"
  | "india"
  | "tech"
  | "economy"
  | "science";

export type FeedDefinition = {
  url: string;
  sourceName: string;
  /** Stored on each article for filtering (not the RSS <category> tag). */
  category: FeedCategorySlug;
};

export const DEFAULT_FEEDS: FeedDefinition[] = [
  {
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    sourceName: "BBC",
    category: "world",
  },
  {
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    sourceName: "BBC",
    category: "tech",
  },
  {
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
    sourceName: "BBC",
    category: "economy",
  },
  {
    url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    sourceName: "BBC",
    category: "science",
  },
  {
    url: "https://www.thehindu.com/news/national/feeder/default.rss",
    sourceName: "The Hindu",
    category: "india",
  },
  {
    url: "https://techcrunch.com/feed/",
    sourceName: "TechCrunch",
    category: "tech",
  },
];
