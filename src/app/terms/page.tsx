import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/i18n/routing";
import type { Locale } from "@/i18n/locales";
import { socialMetadata } from "@/lib/seo/social";
import { LegalDocument } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  const locale = (await getLocale()) as Locale;
  const title = t("terms.title");
  const description = t("terms.seoDescription");
  // Root layout's title template appends " · Staffra".
  return {
    title,
    description,
    alternates: localizedAlternates("/terms", locale),
    ...(await socialMetadata({ locale, path: "/terms", title, description })),
  };
}

export default function TermsPage() {
  return <LegalDocument doc="terms" />;
}
