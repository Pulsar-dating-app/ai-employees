import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Every /dashboard/* subpage (Teach today, F3-F6 later) needs a way back to
// the checklist — not placed in layout.tsx since /dashboard itself renders
// inside that same layout and shouldn't link to itself.
export async function BackToDashboardLink() {
  const t = await getTranslations("Dashboard");

  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900"
    >
      ← {t("backToDashboard")}
    </Link>
  );
}
