import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { intlTag, type Locale } from "@/i18n/locales";
import { localizedAlternates, localizedPath } from "@/i18n/routing";
import { COMPANY, absoluteUrl } from "@/lib/seo/site";
import { AboutPage } from "@/components/about/about-page";

// `/sobre` — who Staffra is. Also re-exported by `[locale]/sobre/page.tsx`.

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  const [t, seo] = await Promise.all([getTranslations("About"), getTranslations("Seo")]);
  // Root layout's title template appends " · Staffra".
  const title = t("seoTitle");
  const description = t("seoDescription", { legalName: COMPANY.legalName, taxId: COMPANY.taxId });

  return {
    title,
    description,
    alternates: localizedAlternates("/sobre", locale),
    openGraph: {
      type: "website",
      url: absoluteUrl(localizedPath(locale, "/sobre")),
      siteName: seo("siteName"),
      locale: intlTag(locale).replace("-", "_"),
      title,
      description,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function SobrePage() {
  return <AboutPage />;
}
