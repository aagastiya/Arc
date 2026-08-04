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
  | "science"
  | "finance"
  | "sports"
  | "local";

export type FeedDefinition = {
  url: string;
  sourceName: string;
  /** Stored on each article for filtering (not the RSS <category> tag). */
  category: FeedCategorySlug;
};

export const DEFAULT_FEEDS: FeedDefinition[] = [
  // Politics / US → stored as world (maps to Geopolitics / World on Today)
  {
    url: "https://feeds.npr.org/1001/rss.xml",
    sourceName: "NPR News",
    category: "world",
  },
  {
    url: "https://rss.politico.com/politics-news.xml",
    sourceName: "Politico",
    category: "world",
  },
  {
    url: "https://thehill.com/feed/",
    sourceName: "The Hill",
    category: "world",
  },
  {
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
    sourceName: "NYT Politics",
    category: "world",
  },
  {
    url: "https://feeds.washingtonpost.com/rss/politics",
    sourceName: "Washington Post Politics",
    category: "world",
  },
  // Business
  {
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    sourceName: "CNBC Top News",
    category: "finance",
  },
  {
    url: "https://feeds.bloomberg.com/markets/news.rss",
    sourceName: "Bloomberg Markets",
    category: "finance",
  },
  {
    url: "https://www.forbes.com/business/feed/",
    sourceName: "Forbes Business",
    category: "finance",
  },
  // Tech
  {
    url: "https://techcrunch.com/feed/",
    sourceName: "TechCrunch",
    category: "tech",
  },
  {
    url: "https://www.theverge.com/rss/index.xml",
    sourceName: "The Verge",
    category: "tech",
  },
  {
    url: "https://www.wired.com/feed/rss",
    sourceName: "Wired",
    category: "tech",
  },
  {
    url: "https://feeds.arstechnica.com/arstechnica/index",
    sourceName: "Ars Technica",
    category: "tech",
  },
  // World
  {
    url: "https://www.theguardian.com/us/rss",
    sourceName: "The Guardian US",
    category: "world",
  },
  {
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    sourceName: "BBC World",
    category: "world",
  },
];
