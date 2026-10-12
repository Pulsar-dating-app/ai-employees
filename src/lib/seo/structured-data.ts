// Pure builders for the JSON-LD graph rendered on the public landing page.
// Kept free of `next-intl` / React so they can be unit-tested directly; the
// server component in `src/components/seo/landing-json-ld.tsx` resolves the
// translated strings and passes them in.
import { SITE_URL, absoluteUrl } from "./site";

export type FaqEntry = { q: string; a: string };
export type PricingPlan = {
  name: string;
  desc?: string;
  /** Display string straight from the message file, e.g. "R$ 399" or "Custom". */
  price: string;
};

type JsonLdNode = Record<string, unknown>;

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * Pull the first run of digits out of a price label ("R$ 1.299/mo" -> "1299").
 * Returns null for non-numeric labels ("Custom", "Sob consulta") so those
 * plans render an Offer with no price rather than a bogus 0.
 */
export function parsePriceAmount(label: string): string | null {
  const digits = label.replace(/[^\d]/g, "");
  return digits.length > 0 ? digits : null;
}

export function buildOrganization(siteName: string): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: siteName,
    url: `${SITE_URL}/`,
    logo: absoluteUrl("/logo.png"),
  };
}

export function buildWebSite(siteName: string, description: string): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: siteName,
    description,
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
      ...(amount
        ? { price: amount, priceCurrency: "BRL" }
        : { priceSpecification: { "@type": "PriceSpecification", priceCurrency: "BRL" } }),
    };
  });

  return {
    "@type": "SoftwareApplication",
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

/** The full `@graph` document for the landing page. */
export function buildLandingGraph(input: {
  siteName: string;
  description: string;
  plans: PricingPlan[];
  faq: FaqEntry[];
}): JsonLdNode {
  const graph: JsonLdNode[] = [
    buildOrganization(input.siteName),
    buildWebSite(input.siteName, input.description),
    buildSoftwareApplication(input.siteName, input.description, input.plans),
  ];
  const faq = buildFaqPage(input.faq);
  if (faq) graph.push(faq);

  return { "@context": "https://schema.org", "@graph": graph };
}

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

export function buildVideoObject(id: string, video: VideoEntry): JsonLdNode {
  return {
    "@type": "VideoObject",
    "@id": id,
    name: video.name,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    contentUrl: video.contentUrl,
    uploadDate: video.uploadDate,
    duration: video.duration,
    publisher: { "@id": ORG_ID },
  };
}

/**
 * The `@graph` for a per-trade page (`/para/<slug>`): the page itself, its
 * breadcrumb trail and its demo video. Organization and WebSite are repeated
 * so the `@id` references resolve within the page, as Google reads each page
 * on its own.
 */
export function buildVerticalPageGraph(input: {
  siteName: string;
  siteDescription: string;
  url: string;
  name: string;
  description: string;
  inLanguage: string;
  breadcrumbs: BreadcrumbEntry[];
  video: VideoEntry;
}): JsonLdNode {
  const breadcrumbId = `${input.url}#breadcrumb`;
  const videoId = `${input.url}#video`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganization(input.siteName),
      buildWebSite(input.siteName, input.siteDescription),
      {
        "@type": "WebPage",
        "@id": `${input.url}#webpage`,
        url: input.url,
        name: input.name,
        description: input.description,
        inLanguage: input.inLanguage,
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": ORG_ID },
        breadcrumb: { "@id": breadcrumbId },
        video: { "@id": videoId },
      },
      buildBreadcrumbList(breadcrumbId, input.breadcrumbs),
      buildVideoObject(videoId, input.video),
    ],
  };
}
