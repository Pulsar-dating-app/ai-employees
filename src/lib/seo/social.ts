import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { intlTag, type Locale } from "@/i18n/locales";
import { localizedPath, type LocalizedPath } from "@/i18n/routing";
import { absoluteUrl } from "./site";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

type OpenGraphExtras = {
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
};

export async function socialMetadata({
  locale,
  path,
  title,
  description,
  openGraph = {},
}: {
  locale: Locale;
  path: LocalizedPath;
  title: string;
  description: string;
  openGraph?: OpenGraphExtras;
}): Promise<Pick<Metadata, "openGraph" | "twitter">> {
  const t = await getTranslations({ locale, namespace: "Seo" });
  const image = { url: absoluteUrl(`/og/${locale}`), ...OG_IMAGE_SIZE, type: "image/png", alt: t("ogAlt") };

  return {
    openGraph: {
      type: "website",
      ...openGraph,
      url: absoluteUrl(localizedPath(locale, path)),
      siteName: t("siteName"),
      locale: intlTag(locale).replace("-", "_"),
      title,
      description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
