import { redirect } from "next/navigation";

/** Genre Review index → desk (first genre with work, or World). */
export default function AdminReviewIndexRedirect() {
  redirect("/admin");
}
