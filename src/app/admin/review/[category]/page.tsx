import { redirect } from "next/navigation";

import { parseReviewCategorySlug, reviewCategorySlug } from "@/lib/categories";

export default async function AdminGenreReviewRedirect({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: raw } = await params;
  const bucket = parseReviewCategorySlug(raw);
  if (!bucket) {
    redirect("/admin");
  }
  redirect(`/admin?genre=${reviewCategorySlug(bucket)}`);
}
