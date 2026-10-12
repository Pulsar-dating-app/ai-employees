import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { intlTag, type Locale } from "@/i18n/locales";
import { localizedAlternates, localizedPath } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/seo/site";
import { findGuide, guidePath } from "@/lib/guides/catalog";
import { GuidePage } from "@/components/guides/guide-page";

// `/guias/<slug>` — long-form guides (src/lib/guides/catalog.ts).
// Also re-exported by `[locale]/guias/[guide]/page.tsx` for `/en`, `/it`.

export async function generateMetadata({ params }: PageProps<"/guias/[guide]">): Promise<Metadata> {
  const guide = findGuide((await params).guide);
  if (!guide) notFound();

  const locale = (await getLocale()) as Locale;
  const [t, seo] = await Promise.all([getTranslations("Guides"), getTranslations("Seo")]);
  const path = guidePath(guide);
  // Root layout's title template appends " · Staffra".
  const title = t(`${guide.key}.seoTitle`);
  const description = t(`${guide.key}.seoDescription`);

  return {
    title,
    description,
    alternates: localizedAlternates(path, locale),
    openGraph: {
      type: "article",
      url: absoluteUrl(localizedPath(locale, path)),
      siteName: seo("siteName"),
      locale: intlTag(locale).replace("-", "_"),
      title,
      description,
      publishedTime: guide.published,
      modifiedTime: guide.updated,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function GuideRoute({ params }: PageProps<"/guias/[guide]">) {
  const guide = findGuide((await params).guide);
  if (!guide) notFound();
  return <GuidePage guide={guide} />;
}
