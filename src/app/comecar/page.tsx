import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { businessFromVerticalSlug } from "@/lib/quiz/answers";
import { landingV2Sans } from "@/components/landing/fonts";
import { StartQuiz } from "@/components/quiz/start-quiz";

// Where the paid ads land: three one-tap questions, a plan built from the
// answers, and sign-up on the same screen. Not one of the indexable public
// pages (it would compete with `/` and `/para/*` for nothing), so it stays on
// the app's cookie/Accept-Language negotiation instead of LOCALIZED_PATHS.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Quiz");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ ramo?: string }>;
}) {
  const [{ ramo }, supabase] = await Promise.all([searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main
      className={`${landingV2Sans.className} relative flex min-h-dvh flex-col items-center bg-[linear-gradient(135deg,#e0e7ff_0%,#f8f9fa_60%,#ffffff_100%)] px-4 py-6 text-on-surface antialiased sm:py-12`}
    >
      <StartQuiz initialBusiness={businessFromVerticalSlug(ramo)} />
    </main>
  );
}
