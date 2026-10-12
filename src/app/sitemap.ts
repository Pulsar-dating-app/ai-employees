import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import { languageAlternates, localizedPath, type LocalizedPath } from "@/i18n/routing";
import { VERTICALS, verticalPath } from "@/lib/verticals/catalog";

// Static list of the public, indexable routes, one entry per language
// (`/`, `/en`, `/it`, …) with reciprocal hreflang alternates, including the
// per-trade pages (`/para/<slug>`, src/lib/verticals/catalog.ts) — see
// src/i18n/routing.ts. `/sign-up` is intentionally absent — it only
// `redirect()`s to `/?auth=signup`. Per-merchant `/talk/*` pages are noindex
// and never listed here.
const PAGES: { path: LocalizedPath; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  ...VERTICALS.map((v) => ({ path: verticalPath(v), changeFrequency: "monthly" as const, priority: 0.8 })),
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.flatMap(({ path, changeFrequency, priority }) =>
    SUPPORTED_LOCALES.map((locale) => ({
      url: absoluteUrl(localizedPath(locale, path)),
      lastModified,
      changeFrequency,
      priority,
      alternates: { languages: languageAlternates(path, absoluteUrl) },
    })),
  );
}
