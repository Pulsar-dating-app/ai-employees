import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { localizedAlternates } from "@/i18n/routing";
import { socialMetadata } from "@/lib/seo/social";
import { findVertical, verticalPath } from "@/lib/verticals/catalog";
import { VerticalPage } from "@/components/verticals/vertical-page";

// `/para/<slug>` — one landing page per trade (src/lib/verticals/catalog.ts).
// Also re-exported by `[locale]/para/[vertical]/page.tsx` for `/en`, `/it`.

export async function generateMetadata({ params }: PageProps<"/para/[vertical]">): Promise<Metadata> {
  const vertical = findVertical((await params).vertical);
  if (!vertical) notFound();

  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("Verticals");
  const path = verticalPath(vertical);
  // Root layout's title template appends " · Staffra".
  const title = t(`${vertical.key}.seoTitle`);
  const description = t(`${vertical.key}.seoDescription`);

  return {
    title,
    description,
    alternates: localizedAlternates(path, locale),
    ...(await socialMetadata({ locale, path, title, description })),
  };
}

export default async function VerticalRoute({ params }: PageProps<"/para/[vertical]">) {
  const vertical = findVertical((await params).vertical);
  if (!vertical) notFound();
  return <VerticalPage vertical={vertical} />;
}
