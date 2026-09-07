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
