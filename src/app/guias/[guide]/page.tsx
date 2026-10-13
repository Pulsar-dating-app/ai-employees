import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { localizedAlternates } from "@/i18n/routing";
import { socialMetadata } from "@/lib/seo/social";
import { findGuide, guidePath } from "@/lib/guides/catalog";
import { GuidePage } from "@/components/guides/guide-page";

// `/guias/<slug>` — long-form guides (src/lib/guides/catalog.ts).
// Also re-exported by `[locale]/guias/[guide]/page.tsx` for `/en`, `/it`.

export async function generateMetadata({ params }: PageProps<"/guias/[guide]">): Promise<Metadata> {
  const guide = findGuide((await params).guide);
  if (!guide) notFound();

  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("Guides");
  const path = guidePath(guide);
  // Root layout's title template appends " · Staffra".
  const title = t(`${guide.key}.seoTitle`);
  const description = t(`${guide.key}.seoDescription`);

  return {
    title,
    description,
    alternates: localizedAlternates(path, locale),
    ...(await socialMetadata({
      locale,
      path,
      title,
      description,
      openGraph: { type: "article", publishedTime: guide.published, modifiedTime: guide.updated },
    })),
  };
}

export default async function GuideRoute({ params }: PageProps<"/guias/[guide]">) {
  const guide = findGuide((await params).guide);
  if (!guide) notFound();
  return <GuidePage guide={guide} />;
}
