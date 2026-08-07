import Link from "next/link";

import { AdminNav } from "@/components/admin-nav";
import {
  CANONICAL_CATEGORY_ORDER,
  normalizeStoryCategory,
  reviewCategorySlug,
  type StoryCategoryBucket,
} from "@/lib/categories";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminReviewIndexPage() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("stories")
    .select("id,category")
    .eq("is_live", false)
    .limit(500);

  if (error) {
    throw new Error(`Failed to load draft counts: ${error.message}`);
  }

  const counts = new Map<StoryCategoryBucket, number>();
  for (const bucket of CANONICAL_CATEGORY_ORDER) {
    counts.set(bucket, 0);
  }
  for (const row of data ?? []) {
    const bucket = normalizeStoryCategory(String(row.category ?? ""));
    if (bucket === "Other") continue;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#c8ff00]">
              Genre Review
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Read a whole section, then publish it in one pass.
            </p>
          </div>
          <AdminNav current="/admin/review" />
        </div>

        <ul className="mt-8 divide-y divide-zinc-900">
          {CANONICAL_CATEGORY_ORDER.map((bucket) => {
            const draftCount = counts.get(bucket) ?? 0;
            return (
              <li key={bucket}>
                <Link
                  href={`/admin/review/${reviewCategorySlug(bucket)}`}
                  className="flex items-center justify-between py-3.5 text-sm transition-colors hover:text-[#c8ff00]"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-0.5 w-5 shrink-0 rounded-full"
                      style={{ backgroundColor: "#c8ff00" }}
                      aria-hidden
                    />
                    <span className="font-semibold uppercase tracking-widest text-zinc-200">
                      {bucket}
                    </span>
                  </span>
                  <span className="text-xs text-zinc-500">
                    {draftCount} draft{draftCount === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
