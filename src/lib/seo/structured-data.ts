// Pure builders for the JSON-LD graphs rendered on the public pages (landing,
// per-trade pages, About, guides). Kept free of `next-intl` / React so they
// can be unit-tested directly; the server components resolve the translated
// strings and pass them in.
//
// Every page repeats the Organization and WebSite nodes so its `@id`
// references resolve within that page — search engines and AI assistants read
// each page on its own. The Organization carries the full company identity
// (legal name, CNPJ, contact, `sameAs`) because other companies share the
// "Staffra" name and this is how a crawler tells them apart.
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import { HREFLANG } from "@/i18n/routing";
import { COMPANY, SITE_URL, SOCIAL_PROFILES, absoluteUrl } from "./site";

export type FaqEntry = { q: string; a: string };
export type PricingPlan = {
  name: string;
  desc?: string;
  /** Display string straight from the message file, e.g. "R$ 399" or "Custom". */
  price: string;
};

/** What every page's graph needs to describe the site and the company. */
export type SiteIdentity = {
  siteName: string;
  /** The site's meta description (WebSite node). */
  siteDescription: string;
  /** What the company is (Organization node) — the canonical brand definition. */
  orgDescription: string;
};

export type BreadcrumbEntry = { name: string; url: string };
export type VideoEntry = {
  name: string;
  description: string;
  thumbnailUrl: string;
  contentUrl: string;
  /** ISO 8601 date the video was published. */
  uploadDate: string;
  /** ISO 8601 duration, e.g. "PT37S". */
  duration: string;
};

type JsonLdNode = Record<string, unknown>;

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
export const SOFTWARE_ID = `${SITE_URL}/#software`;
const PRICING_URL = `${SITE_URL}/#planos`;

/**
 * Pull the first run of digits out of a price label ("R$ 1.299/mo" -> "1299").
 * Returns null for non-numeric labels ("Custom", "Sob consulta") so those
 * plans render an Offer with no price rather than a bogus 0.
 */
export function parsePriceAmount(label: string): string | null {
  const digits = label.replace(/[^\d]/g, "");
  return digits.length > 0 ? digits : null;
}

export function buildOrganization(siteName: string, description: string): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: siteName,
    alternateName: "Staffra.io",
    legalName: COMPANY.legalName,
    taxID: COMPANY.taxId,
    description,
    url: `${SITE_URL}/`,
    logo: { "@type": "ImageObject", url: absoluteUrl("/logo-icon.png"), width: 578, height: 578 },
    email: COMPANY.email,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: COMPANY.email,
      availableLanguage: SUPPORTED_LOCALES.map((l) => HREFLANG[l]),
    },
    areaServed: { "@type": "Country", name: "Brazil" },
    address: { "@type": "PostalAddress", addressCountry: COMPANY.country },
    ...(SOCIAL_PROFILES.length > 0 ? { sameAs: [...SOCIAL_PROFILES] } : {}),
  };
}

export function buildWebSite(siteName: string, description: string): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: siteName,
    description,
    inLanguage: SUPPORTED_LOCALES.map((l) => HREFLANG[l]),
    publisher: { "@id": ORG_ID },
  };
}

export function buildSoftwareApplication(
  siteName: string,
  description: string,
  plans: PricingPlan[],
): JsonLdNode {
  const offers = plans.map((plan) => {
    const amount = parsePriceAmount(plan.price);
    return {
      "@type": "Offer",
      name: plan.name,
      ...(plan.desc ? { description: plan.desc } : {}),
      url: PRICING_URL,
      availability: "https://schema.org/InStock",
      ...(amount
        ? {
            price: amount,
            priceCurrency: "BRL",
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: amount,
              priceCurrency: "BRL",
              unitCode: "MON",
            },
          }
        : {}),
    };
  });

  return {
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: siteName,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/`,
    description,
    publisher: { "@id": ORG_ID },
    ...(offers.length > 0 ? { offers } : {}),
  };
}

export function buildFaqPage(entries: FaqEntry[]): JsonLdNode | null {
  if (entries.length === 0) return null;
  return {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.q,
      acceptedAnswer: { "@type": "Answer", text: entry.a },
    })),
  };
}

export function buildBreadcrumbList(id: string, entries: BreadcrumbEntry[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    "@id": id,
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.url,
    })),
  };
}

export function toDateTime(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00-03:00` : date;
}

export function buildVideoObject(id: string, video: VideoEntry): JsonLdNode {
  return {
    "@type": "VideoObject",
    "@id": id,
    name: video.name,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    contentUrl: video.contentUrl,
    uploadDate: toDateTime(video.uploadDate),
    duration: video.duration,
    // The demo videos are recorded in Portuguese whatever the page language.
    inLanguage: "pt-BR",
    publisher: { "@id": ORG_ID },
  };
}

type PageInput = {
  /** schema.org type of the page node: WebPage, AboutPage, … */
  type?: string;
  url: string;
  name: string;
  description: string;
  inLanguage: string;
  /** Extra properties merged into the page node (about, mentions, video ref, …). */
  extra?: JsonLdNode;
};

/**
 * The `@graph` for one page: Organization + WebSite, the page node, an
 * optional breadcrumb trail, then any page-specific nodes (video, article,
 * software).
 */
export function buildPageGraph(input: {
  site: SiteIdentity;
  page: PageInput;
  breadcrumbs?: BreadcrumbEntry[];
  nodes?: JsonLdNode[];
}): JsonLdNode {
  const { site, page } = input;
  const breadcrumbId = `${page.url}#breadcrumb`;
  const hasBreadcrumbs = (input.breadcrumbs?.length ?? 0) > 0;

  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganization(site.siteName, site.orgDescription),
      buildWebSite(site.siteName, site.siteDescription),
      {
        "@type": page.type ?? "WebPage",
        "@id": `${page.url}#webpage`,
        url: page.url,
        name: page.name,
        description: page.description,
        inLanguage: page.inLanguage,
        isPartOf: { "@id": WEBSITE_ID },
        ...(hasBreadcrumbs ? { breadcrumb: { "@id": breadcrumbId } } : {}),
        ...page.extra,
      },
      ...(hasBreadcrumbs ? [buildBreadcrumbList(breadcrumbId, input.breadcrumbs!)] : []),
      ...(input.nodes ?? []),
    ],
  };
}

/** The landing page: the product itself (SoftwareApplication + offers) and its FAQ. */
export function buildLandingGraph(input: {
  site: SiteIdentity;
  url: string;
  name: string;
  inLanguage: string;
  plans: PricingPlan[];
  faq: FaqEntry[];
}): JsonLdNode {
  const faq = buildFaqPage(input.faq);
  return buildPageGraph({
    site: input.site,
    page: {
      url: input.url,
      name: input.name,
      description: input.site.siteDescription,
      inLanguage: input.inLanguage,
      extra: { about: { "@id": SOFTWARE_ID }, mainEntity: { "@id": SOFTWARE_ID } },
    },
    nodes: [
      buildSoftwareApplication(input.site.siteName, input.site.orgDescription, input.plans),
      ...(faq ? [faq] : []),
    ],
  });
}

/**
 * A per-trade page (`/para/<slug>`): the page is about scheduling for that
 * trade, mentions the product, and carries its demo video.
 */
export function buildVerticalPageGraph(input: {
  site: SiteIdentity;
  url: string;
  name: string;
  description: string;
  inLanguage: string;
  /** The trade's name as shown on the page ("Barbearias"). */
  trade: string;
  breadcrumbs: BreadcrumbEntry[];
  video: VideoEntry;
  plans: PricingPlan[];
}): JsonLdNode {
  const videoId = `${input.url}#video`;
  return buildPageGraph({
    site: input.site,
    page: {
      url: input.url,
      name: input.name,
      description: input.description,
      inLanguage: input.inLanguage,
      extra: {
        about: { "@type": "Thing", name: input.trade },
        mentions: { "@id": SOFTWARE_ID },
        video: { "@id": videoId },
      },
    },
    breadcrumbs: input.breadcrumbs,
    nodes: [
      buildVideoObject(videoId, input.video),
      buildSoftwareApplication(input.site.siteName, input.site.orgDescription, input.plans),
    ],
  });
}

/** The About page: an AboutPage whose subject is the company. */
export function buildAboutPageGraph(input: {
  site: SiteIdentity;
  url: string;
  name: string;
  description: string;
  inLanguage: string;
  breadcrumbs: BreadcrumbEntry[];
}): JsonLdNode {
  return buildPageGraph({
    site: input.site,
    page: {
      type: "AboutPage",
      url: input.url,
      name: input.name,
      description: input.description,
      inLanguage: input.inLanguage,
      extra: { about: { "@id": ORG_ID }, mainEntity: { "@id": ORG_ID } },
    },
    breadcrumbs: input.breadcrumbs,
  });
}

/** A guide: an Article written and published by the company. */
export function buildArticleGraph(input: {
  site: SiteIdentity;
  url: string;
  headline: string;
  description: string;
  inLanguage: string;
  datePublished: string;
  dateModified: string;
  breadcrumbs: BreadcrumbEntry[];
}): JsonLdNode {
  const articleId = `${input.url}#article`;
  return buildPageGraph({
    site: input.site,
    page: {
      url: input.url,
      name: input.headline,
      description: input.description,
      inLanguage: input.inLanguage,
      extra: { mainEntity: { "@id": articleId } },
    },
    breadcrumbs: input.breadcrumbs,
    nodes: [
      {
        "@type": "Article",
        "@id": articleId,
        headline: input.headline,
        description: input.description,
        inLanguage: input.inLanguage,
        datePublished: input.datePublished,
        dateModified: input.dateModified,
        author: { "@id": ORG_ID },
        publisher: { "@id": ORG_ID },
        mainEntityOfPage: { "@id": `${input.url}#webpage` },
      },
    ],
  });
}
