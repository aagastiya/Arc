import { FeedApp } from "@/components/arc/feed-app";
import { getArticlesForTab } from "@/lib/articles";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat = "today" } = await searchParams;

  const hasEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );

  const articles = hasEnv ? await getArticlesForTab(cat) : [];

  const placeholder =
    cat === "clips" || cat === "verify" || cat === "topics" || cat === "you"
      ? (cat as "clips" | "verify" | "topics" | "you")
      : undefined;

  return (
    <FeedApp
      articles={articles}
      currentCat={cat}
      configMissing={!hasEnv}
      placeholder={placeholder}
    />
  );
}
