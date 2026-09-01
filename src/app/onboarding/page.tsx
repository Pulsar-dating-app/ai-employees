import { redirect } from "next/navigation";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OnboardingForm } from "./onboarding-form";
import logo from "../../../public/logo.png";

// First stop after sign-up for an account with no company. This is the only
// place a company is created; the dashboard shell redirects here until one
// exists, and redirects away once it does. Standalone page (root layout,
// not the dashboard shell) so there's no redirect loop.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companies } = await supabase.from("companies").select("id").limit(1);
  if (companies && companies.length > 0) redirect("/dashboard");

  const [t, locale] = await Promise.all([getTranslations("Onboarding"), getLocale()]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 shadow-level2">
        <div className="flex flex-col gap-1.5">
          <Image src={logo} alt="Staffra" className="h-9 w-auto self-start" priority />
          <h1 className="mt-3 text-xl font-semibold text-on-surface">{t("title")}</h1>
          <p className="text-sm text-on-surface-variant">{t("subtitle")}</p>
        </div>

        <div className="mt-6">
          <OnboardingForm />
        </div>

        <div className="mt-6 flex justify-end border-t border-outline-variant pt-4">
          <LanguageSwitcher currentLocale={locale as "en" | "pt"} />
        </div>
      </div>
    </main>
  );
}
