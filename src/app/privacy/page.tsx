import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/i18n/routing";
import type { Locale } from "@/i18n/locales";
import { socialMetadata } from "@/lib/seo/social";
import { LegalDocument } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  const locale = (await getLocale()) as Locale;
  const title = t("privacy.title");
  const description = t("privacy.seoDescription");
  // Root layout's title template appends " · Staffra".
  return {
    title,
    description,
    alternates: localizedAlternates("/privacy", locale),
    ...(await socialMetadata({ locale, path: "/privacy", title, description })),
  };
}

export default function PrivacyPage() {
  return <LegalDocument doc="privacy" />;
}
