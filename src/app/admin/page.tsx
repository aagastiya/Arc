import { AdminDesk } from "@/components/admin-desk";
import { loadDeskGenres, loadDeskScanCache } from "@/lib/admin/desk-data";
import { parseReviewCategorySlug } from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function AdminDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const params = await searchParams;
  const genreParam = params.genre?.trim().toLowerCase() ?? null;
  const initialGenre = genreParam
    ? parseReviewCategorySlug(genreParam)
      ? genreParam
      : null
    : null;

  const [scan, desk] = await Promise.all([
    loadDeskScanCache(),
    loadDeskGenres(),
  ]);

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-8 text-zinc-100 md:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <AdminDesk
          editionLabel={desk.editionLabel}
          totalLiveToday={desk.totalLiveToday}
          genres={desk.genres}
          initialClusters={scan.clusters}
          scanCachedAt={scan.cachedAt}
          initialGenre={initialGenre}
        />
      </div>
    </main>
  );
}
