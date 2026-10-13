import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { HREFLANG, localizedPath } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/seo/site";
import { buildLandingGraph, type FaqEntry } from "@/lib/seo/structured-data";
import { JsonLdScript, loadSchemaContext } from "./schema-context";

// Server component: emits the landing page's schema.org graph (Organization,
// WebSite, WebPage, SoftwareApplication with offers, FAQPage) as a single
// JSON-LD script. The FAQ content is the same message data the visible
// landing sections render, so the structured data can't drift from the page.
export async function LandingJsonLd() {
  const locale = (await getLocale()) as Locale;
  const [{ site, plans }, seo, landing] = await Promise.all([
    loadSchemaContext(),
    getTranslations("Seo"),
    getTranslations("LandingV2"),
  ]);

  const graph = buildLandingGraph({
    site,
    url: absoluteUrl(localizedPath(locale, "/")),
    name: seo("defaultTitle"),
    inLanguage: HREFLANG[locale],
    plans,
    faq: (landing.raw("faq.items") as FaqEntry[]) ?? [],
  });

  return <JsonLdScript graph={graph} />;
}
