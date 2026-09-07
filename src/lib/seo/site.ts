// Single source of truth for the site's public origin, used by metadata,
// the sitemap, robots.txt and the JSON-LD builder.
//
// `NEXT_PUBLIC_SITE_URL` is the canonical, protocol-qualified origin with no
// trailing slash (e.g. `https://www.staffra.io`). It is read once here so a
// change of domain (apex vs. www, a staging host) is a single env change.
// The fallback keeps local dev and preview builds working before the env is
// set; production must set it explicitly. Whether the canonical host keeps
// the `www.` prefix is still an open decision — see the "padronizar domínio
// canônico" SEO card — this constant follows whatever that env says.
const FALLBACK_SITE_URL = "https://www.staffra.io";

function normalize(url: string): string {
  return url.replace(/\/+$/, "");
}

export const SITE_URL = normalize(
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || FALLBACK_SITE_URL,
);

/** Absolute URL for a site-relative path (`/`, `/privacy`, …). */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
