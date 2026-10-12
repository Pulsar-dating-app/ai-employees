import { getTranslations } from "next-intl/server";
import { absoluteUrl, COMPANY, SITE_URL } from "@/lib/seo/site";
import { buildLlmsTxt, type LlmsFact } from "@/lib/seo/llms";
import { VERTICALS, verticalPath } from "@/lib/verticals/catalog";
import { GUIDES, guidePath } from "@/lib/guides/catalog";
import { LANDING_PLANS } from "@/components/landing/landing-plans";

// /llms.txt — the site in one Markdown brief for AI assistants (see
// src/lib/seo/llms.ts). Always Portuguese, the primary market; the English
// and Italian pages are pointed to at the end. Built from the same message
// copy and catalogs as the pages, so it can't drift from them.

export const dynamic = "force-static";

const LOCALE = "pt";
const BRL_WHOLE = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export async function GET() {
  const [brand, about, seo, tv, tg, legal] = await Promise.all([
    getTranslations({ locale: LOCALE, namespace: "Brand" }),
    getTranslations({ locale: LOCALE, namespace: "About" }),
    getTranslations({ locale: LOCALE, namespace: "Seo" }),
    getTranslations({ locale: LOCALE, namespace: "Verticals" }),
    getTranslations({ locale: LOCALE, namespace: "Guides" }),
    getTranslations({ locale: LOCALE, namespace: "Legal" }),
  ]);

  const price = BRL_WHOLE.format(LANDING_PLANS[0].ownCents / 100);
  const facts: LlmsFact[] = (about.raw("facts") as LlmsFact[]).map((_, i) => ({
    label: about(`facts.${i}.label`),
    value: about(`facts.${i}.value`, { price }),
  }));
  const company = { legalName: COMPANY.legalName, taxId: COMPANY.taxId };

  const body = buildLlmsTxt({
    siteName: seo("siteName"),
    definition: brand("definition"),
    facts,
    sections: [
      {
        heading: brand("llms.mainPages"),
        links: [
          { title: seo("siteName"), url: absoluteUrl("/"), note: seo("description") },
          { title: about("eyebrow"), url: absoluteUrl("/sobre"), note: about("seoDescription", company) },
          { title: brand("llms.pricing"), url: `${SITE_URL}/#planos`, note: about("facts.2.value", { price }) },
        ],
      },
      {
        heading: brand("llms.byTrade"),
        links: VERTICALS.map((v) => ({
          title: tv(`${v.key}.navLabel`),
          url: absoluteUrl(verticalPath(v)),
          note: tv(`${v.key}.seoDescription`),
        })),
      },
      {
        heading: brand("llms.guides"),
        links: GUIDES.map((g) => ({
          title: tg(`${g.key}.title`),
          url: absoluteUrl(guidePath(g)),
          note: tg(`${g.key}.seoDescription`),
        })),
      },
      {
        heading: brand("llms.policies"),
        links: [
          { title: legal("privacy.title"), url: absoluteUrl("/privacy"), note: legal("privacy.seoDescription") },
          { title: legal("terms.title"), url: absoluteUrl("/terms"), note: legal("terms.seoDescription") },
        ],
      },
    ],
    company: {
      heading: brand("llms.company"),
      lines: [
        brand("llms.legalName", { value: COMPANY.legalName }),
        brand("llms.taxId", { value: COMPANY.taxId }),
        brand("llms.contact", { value: COMPANY.email }),
        brand("llms.site", { value: absoluteUrl("/") }),
      ],
    },
    footer: brand("llms.languages", { en: absoluteUrl("/en"), it: absoluteUrl("/it") }),
  });

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
