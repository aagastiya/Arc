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
  // Geopolitics / world
  {
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    sourceName: "BBC World News",
    category: "world",
  },
  {
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    sourceName: "Al Jazeera All News",
    category: "world",
  },
  {
    url: "https://www.theguardian.com/world/rss",
    sourceName: "The Guardian World",
    category: "world",
  },
  {
    url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    sourceName: "NYT World",
    category: "world",
  },
  {
    url: "http://rss.cnn.com/rss/edition_world.rss",
    sourceName: "CNN World",
    category: "world",
  },
  // India
  {
    url: "https://www.thehindu.com/news/national/feeder/default.rss",
    sourceName: "The Hindu National",
    category: "india",
  },
  {
    url: "https://www.thehindu.com/feeder/default.rss",
    sourceName: "The Hindu Top News",
    category: "india",
  },
  {
    url: "https://indianexpress.com/section/india/feed/",
    sourceName: "Indian Express India",
    category: "india",
  },
  {
    url: "https://feeds.feedburner.com/ndtvnews-top-stories",
    sourceName: "NDTV Top Stories",
    category: "india",
  },
  {
    url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml",
    sourceName: "Hindustan Times India",
    category: "india",
  },
  {
    url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    sourceName: "Times of India Top Stories",
    category: "india",
  },
  // Finance
  {
    url: "https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com/business",
    sourceName: "Reuters Business (Google News)",
    category: "finance",
  },
  {
    url: "https://feeds.bloomberg.com/technology/news.rss",
    sourceName: "Bloomberg Technology",
    category: "finance",
  },
  {
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
    sourceName: "BBC Business",
    category: "finance",
  },
  {
    url: "https://www.livemint.com/rss/markets",
    sourceName: "Livemint Markets",
    category: "finance",
  },
  {
    url: "https://www.business-standard.com/rss/latest.rss",
    sourceName: "Business Standard",
    category: "finance",
  },
  {
    url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    sourceName: "Economic Times Markets",
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
  {
    url: "https://hnrss.org/frontpage",
    sourceName: "Hacker News Frontpage",
    category: "tech",
  },
  // Sports
  {
    url: "https://feeds.bbci.co.uk/sport/rss.xml",
    sourceName: "BBC Sport",
    category: "sports",
  },
  {
    url: "https://www.espn.com/espn/rss/news",
    sourceName: "ESPN Top Headlines",
    category: "sports",
  },
  {
    url: "https://www.espncricinfo.com/rss/content/story/feeds/0.xml",
    sourceName: "ESPN Cricinfo",
    category: "sports",
  },
  {
    url: "https://timesofindia.indiatimes.com/rssfeeds/4719148.cms",
    sourceName: "Times of India Sports",
    category: "sports",
  },
  // Local
  {
    url: "https://www.thehindu.com/news/cities/Delhi/feeder/default.rss",
    sourceName: "The Hindu Delhi",
    category: "local",
  },
  {
    url: "https://www.thehindu.com/news/cities/Bangalore/feeder/default.rss",
    sourceName: "The Hindu Bangalore",
    category: "local",
  },
  {
    url: "https://www.thehindu.com/news/cities/mumbai/feeder/default.rss",
    sourceName: "The Hindu Mumbai",
    category: "local",
  },
  {
    url: "https://www.hindustantimes.com/feeds/rss/cities/delhi-news/rssfeed.xml",
    sourceName: "Hindustan Times Delhi",
    category: "local",
  },
];
