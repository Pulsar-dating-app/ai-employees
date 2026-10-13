import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { localizedAlternates } from "@/i18n/routing";
import { COMPANY } from "@/lib/seo/site";
import { socialMetadata } from "@/lib/seo/social";
import { AboutPage } from "@/components/about/about-page";

// `/sobre` — who Staffra is. Also re-exported by `[locale]/sobre/page.tsx`.

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("About");
  // Root layout's title template appends " · Staffra".
  const title = t("seoTitle");
  const description = t("seoDescription", { legalName: COMPANY.legalName, taxId: COMPANY.taxId });

  return {
    title,
    description,
    alternates: localizedAlternates("/sobre", locale),
    ...(await socialMetadata({ locale, path: "/sobre", title, description })),
  };
}

export default function SobrePage() {
  return <AboutPage />;
}
