// Single source of truth for the site's public origin, used by metadata,
// the sitemap, robots.txt and the JSON-LD builder.
//
// This is the same value as `STAFFRA_CHECKOUT_BASE_URL` — "this app's public
// origin", as its .env comment puts it — so it reads that env var rather
// than inventing a second name for the same thing. Server-only code (all of
// the SEO surface is), so no `NEXT_PUBLIC_` prefix is needed. The fallback
// is the real production apex, keeping local dev, preview builds and CI
// working without the env set; production sets it explicitly. Whether the
// canonical host keeps a `www.` prefix is a separate decision — see the
// "padronizar domínio canônico" SEO card — this constant just follows the
// env.
const FALLBACK_SITE_URL = "https://staffra.io";

function normalize(url: string): string {
  return url.replace(/\/+$/, "");
}

export const SITE_URL = normalize(
  process.env.STAFFRA_CHECKOUT_BASE_URL?.trim() || FALLBACK_SITE_URL,
);

/** Absolute URL for a site-relative path (`/`, `/privacy`, …). */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The company behind Staffra — one source for the footer's legal line, the
 * About page, the Organization schema and /llms.txt, so search engines and
 * AI assistants see the same identity everywhere. Data, not UI copy: the
 * labels around it live in messages/*.json (`Brand.*`).
 */
export const COMPANY = {
  legalName: "PULSAR LTDA",
  taxId: "58.261.994/0001-80",
  email: "contato@staffra.io",
  country: "BR",
} as const;

/**
 * Official social profiles, emitted as the Organization's `sameAs` (the
 * strongest "this is the same company" signal for search engines and AI
 * assistants — other companies share the "Staffra" name) and linked from the
 * site footer. Add each URL here as it's created.
 */
export const SOCIAL_LINKS = {
  linkedin: "https://www.linkedin.com/company/staffra-io",
  instagram: "https://www.instagram.com/staffra.io/",
} as const;

export const SOCIAL_PROFILES: readonly string[] = Object.values(SOCIAL_LINKS);
