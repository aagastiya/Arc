/**
 * Default RSS sources. Category slugs power tab filters on the home feed.
 * Add or remove entries, then run POST /api/rss/sync to ingest.
 */
export type FeedCategorySlug =
  | "today"
  | "world"
  | "india"
  | "tech"
  | "culture"
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
  {
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    sourceName: "MarketWatch",
    category: "finance",
  },
  {
    url: "https://markets.businessinsider.com/rss/news",
    sourceName: "Business Insider Markets",
    category: "finance",
  },
  {
    url: "https://fortune.com/feed/fortune-feeds/?id=3230629",
    sourceName: "Fortune",
    category: "finance",
  },
  // Headline-only feed: items carry no summary, so its articles cluster on title alone.
  {
    url: "https://finance.yahoo.com/news/rssindex",
    sourceName: "Yahoo Finance",
    category: "finance",
  },
  {
    url: "https://www.pbs.org/newshour/feeds/rss/headlines",
    sourceName: "PBS NewsHour",
    category: "world",
  },
  {
    url: "https://feeds.nbcnews.com/nbcnews/public/news",
    sourceName: "NBC News",
    category: "world",
  },
  {
    url: "https://feeds.abcnews.com/abcnews/topstories",
    sourceName: "ABC News",
    category: "world",
  },
  {
    url: "https://www.cbsnews.com/latest/rss/main",
    sourceName: "CBS News",
    category: "world",
  },
  {
    url: "https://time.com/feed/",
    sourceName: "Time",
    category: "world",
  },
  {
    url: "https://api.axios.com/feed/",
    sourceName: "Axios",
    category: "world",
  },
  {
    url: "https://rss.upi.com/news/top_news.rss",
    sourceName: "UPI Top News",
    category: "world",
  },
  {
    url: "https://www.semafor.com/rss.xml",
    sourceName: "Semafor",
    category: "world",
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
    url: "https://www.zdnet.com/news/rss.xml",
    sourceName: "ZDNet",
    category: "tech",
  },
  {
    url: "https://www.technologyreview.com/feed/",
    sourceName: "MIT Technology Review",
    category: "tech",
  },
  {
    url: "https://www.engadget.com/rss.xml",
    sourceName: "Engadget",
    category: "tech",
  },
  {
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    sourceName: "The Verge AI",
    category: "tech",
  },
  {
    url: "https://www.404media.co/rss/",
    sourceName: "404 Media",
    category: "tech",
  },
  // Culture
  {
    url: "https://variety.com/feed/",
    sourceName: "Variety",
    category: "culture",
  },
  {
    url: "https://www.hollywoodreporter.com/feed/",
    sourceName: "The Hollywood Reporter",
    category: "culture",
  },
  {
    url: "https://www.rollingstone.com/feed/",
    sourceName: "Rolling Stone",
    category: "culture",
  },
  {
    url: "https://www.indiewire.com/feed/",
    sourceName: "IndieWire",
    category: "culture",
  },
  {
    url: "https://www.thewrap.com/feed/",
    sourceName: "TheWrap",
    category: "culture",
  },
  {
    url: "https://feeds.feedburner.com/nymag/vulture",
    sourceName: "Vulture",
    category: "culture",
  },
  {
    url: "https://deadline.com/feed/",
    sourceName: "Deadline",
    category: "culture",
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
