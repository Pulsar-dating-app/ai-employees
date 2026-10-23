import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import { languageAlternates, localizedPath, type LocalizedPath } from "@/i18n/routing";
import { VERTICALS, verticalPath } from "@/lib/verticals/catalog";
import { GUIDES, guidePath } from "@/lib/guides/catalog";

// Every public, indexable page, one entry per language (`/`, `/en`, `/it`,
// …) with reciprocal hreflang alternates — see src/i18n/routing.ts. Includes
// the per-trade pages (src/lib/verticals/catalog.ts) and the guides
// (src/lib/guides/catalog.ts). `/sign-up` is intentionally absent — it only
// `redirect()`s to `/?auth=signup`. Per-merchant `/talk/*` pages are noindex
// and never listed here.
//
// `lastModified` is the date the page's content last changed, never the
// request time: a lastmod that always says "now" teaches search engines to
// ignore it. Bump a page's date when you change its copy. (changefreq and
// priority are omitted — Google ignores both.)
const PAGES: { path: LocalizedPath; updated: string }[] = [
  { path: "/", updated: "2026-10-12" },
  { path: "/sobre", updated: "2026-10-12" },
  ...VERTICALS.map((v) => ({ path: verticalPath(v), updated: v.updated })),
  ...GUIDES.map((g) => ({ path: guidePath(g), updated: g.updated })),
  { path: "/privacy", updated: "2026-10-23" },
  { path: "/terms", updated: "2026-10-12" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap(({ path, updated }) =>
    SUPPORTED_LOCALES.map((locale) => ({
      url: absoluteUrl(localizedPath(locale, path)),
      lastModified: updated,
      alternates: { languages: languageAlternates(path, absoluteUrl) },
    })),
  );
}
