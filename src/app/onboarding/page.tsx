import { redirect } from "next/navigation";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm, LocaleToggle } from "./onboarding-form";
import logoIcon from "../../../public/logo-icon.png";

// First stop after sign-up for an account with no company. This is the only
// place a company is created; the dashboard shell redirects here until one
// exists, and redirects away once it does. Standalone page (root layout, not
// the dashboard shell) so there's no redirect loop.
//
// Visual: the Stitch "Staffra Onboarding - Setup Business" screen — an
// indigo→white diagonal gradient ground, a centered logo, and a single
// frosted-glass card holding the one-field form.
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
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(135deg,#e0e7ff_0%,#f8f9fa_60%,#ffffff_100%)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-12 flex justify-center">
          <Image
            src={logoIcon}
            alt="Staffra"
            priority
            className="h-14 w-14 object-contain"
          />
        </div>

        <div className="relative overflow-hidden rounded-lg border border-[#e0e7ff] bg-white/85 p-8 shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur-md sm:p-12">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-primary/5 to-transparent" />

          <div className="relative z-10 flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-on-surface sm:text-[32px] sm:leading-10">
                {t("title")}
              </h1>
              <p className="mt-2 text-body-md text-on-surface-variant">{t("subtitle")}</p>
            </div>

            <OnboardingForm />
          </div>
        </div>

        <div className="mt-12 flex justify-center">
          <LocaleToggle currentLocale={locale as "en" | "pt"} />
        </div>
      </div>
    </main>
  );
}
