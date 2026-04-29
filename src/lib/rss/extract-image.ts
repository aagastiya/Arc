import type { Item } from "rss-parser";

/** Best-effort image URL from RSS / HTML content. */
export function extractImageUrl(item: Item): string | null {
  const enc = item.enclosure;
  if (enc?.url && enc.type?.startsWith("image/")) {
    return enc.url;
  }

  const raw = item as Record<string, unknown>;
  const thumb = raw["media:thumbnail"] as { $?: { url?: string } } | undefined;
  if (thumb?.$?.url) {
    return thumb.$.url;
  }

  const content =
    (typeof item.content === "string" && item.content) ||
    (typeof raw["content:encoded"] === "string" && raw["content:encoded"]) ||
    "";
  if (content) {
    const m = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m?.[1]) {
      return m[1];
    }
  }

  return null;
}
