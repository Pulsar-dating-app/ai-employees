import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/i18n/routing";
import type { Locale } from "@/i18n/locales";
import { LegalDocument } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  const locale = (await getLocale()) as Locale;
  // Root layout's title template appends " · Staffra".
  return {
    title: t("privacy.title"),
    alternates: localizedAlternates("/privacy", locale),
  };
}

export default function PrivacyPage() {
  return <LegalDocument doc="privacy" />;
}
