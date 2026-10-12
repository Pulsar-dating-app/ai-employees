import { isSupportedLocale, localeFromAcceptLanguage, SUPPORTED_LOCALES, type Locale } from "./locales";
import { VERTICALS, verticalPath } from "@/lib/verticals/catalog";

// Per-locale URLs for the public, indexable pages only. Search engines crawl
// without cookies or Accept-Language, so a page whose language is negotiated
// per request can only ever be indexed in one language — these routes give
// every language its own crawlable URL. The authenticated app (dashboard,
// onboarding, auth redirects) stays on cookie/Accept-Language negotiation
// (src/i18n/request.ts): it is never indexed, and keeping it unprefixed is
// what spares every redirect()/Link in it from a rewrite.
//
// Client-safe (no next/headers) — the language switcher and client
// components import from here.

/** Language served by the unprefixed URLs (`/`, `/privacy`, `/terms`) — Brazil is the primary market. */
export const UNPREFIXED_LOCALE: Locale = "pt";

/** Locales that live under a `/<locale>` prefix (`/en`, `/it/privacy`, …). */
export const PREFIXED_LOCALES: readonly Locale[] = SUPPORTED_LOCALES.filter((l) => l !== UNPREFIXED_LOCALE);

export const LOCALIZED_PATHS = ["/", "/privacy", "/terms", ...VERTICALS.map(verticalPath)] as const;
export type LocalizedPath = (typeof LOCALIZED_PATHS)[number];

/** Request header the proxy sets with the URL's locale; it outranks the cookie in resolveLocale(). */
export const LOCALE_REQUEST_HEADER = "x-staffra-locale";

/** hreflang value per locale (pt is Brazilian Portuguese specifically). */
export const HREFLANG: Record<Locale, string> = { en: "en", pt: "pt-BR", it: "it" };

function isLocalizedPath(path: string): path is LocalizedPath {
  return (LOCALIZED_PATHS as readonly string[]).includes(path);
}

export function isPrefixedLocale(value: unknown): value is Locale {
  return isSupportedLocale(value) && value !== UNPREFIXED_LOCALE;
}

/** The URL of `basePath` in `locale`: `localizedPath("en", "/privacy")` → `/en/privacy`. */
export function localizedPath(locale: Locale, basePath: LocalizedPath): string {
  if (locale === UNPREFIXED_LOCALE) return basePath;
  return basePath === "/" ? `/${locale}` : `/${locale}${basePath}`;
}

/** `/en/privacy` → `{ locale: "en", basePath: "/privacy" }`; `null` for anything that isn't a localized public page. */
export function parseLocalizedPath(pathname: string): { locale: Locale; basePath: LocalizedPath } | null {
  if (isLocalizedPath(pathname)) return { locale: UNPREFIXED_LOCALE, basePath: pathname };

  const [, first, ...rest] = pathname.split("/");
  if (!isPrefixedLocale(first)) return null;

  const basePath = rest.length ? `/${rest.join("/")}` : "/";
  return isLocalizedPath(basePath) ? { locale: first, basePath } : null;
}

/**
 * Points a site-relative href at `locale`'s copy of a localized page,
 * keeping its query and hash (`/?auth=signup` → `/en?auth=signup`). Anything
 * else — anchors, app routes, external URLs — is returned unchanged.
 */
export function localizeHref(locale: Locale, href: string): string {
  const match = /^(\/[^?#]*)(.*)$/.exec(href);
  if (!match || !isLocalizedPath(match[1])) return href;
  return localizedPath(locale, match[1]) + match[2];
}

/** `alternates` metadata for a localized page: self-canonical plus reciprocal hreflang. */
export function localizedAlternates(basePath: LocalizedPath, locale: Locale) {
  return {
    canonical: localizedPath(locale, basePath),
    languages: languageAlternates(basePath),
  };
}

/** hreflang → URL for every locale of `basePath`, with the unprefixed (Portuguese) page as `x-default`. */
export function languageAlternates(basePath: LocalizedPath, toUrl: (path: string) => string = (p) => p) {
  const languages: Record<string, string> = {};
  for (const locale of SUPPORTED_LOCALES) {
    languages[HREFLANG[locale]] = toUrl(localizedPath(locale, basePath));
  }
  languages["x-default"] = toUrl(localizedPath(UNPREFIXED_LOCALE, basePath));
  return languages;
}

/**
 * Whether the proxy should write the `locale` cookie when serving a public
 * page in `served`: only when the rest of the app (cookie, else
 * Accept-Language — see request.ts) would otherwise resolve a different
 * language. The root layout and its message bundle survive client-side
 * navigation, so without this a visitor reading `/en` with a Portuguese
 * browser would log in to a half-English, half-Portuguese dashboard.
 */
export function shouldPinLocaleCookie({
  served,
  cookieLocale,
  acceptLanguage,
}: {
  served: Locale;
  cookieLocale: string | undefined;
  acceptLanguage: string | null;
}): boolean {
  const appLocale = isSupportedLocale(cookieLocale) ? cookieLocale : localeFromAcceptLanguage(acceptLanguage);
  return appLocale !== served;
}

export type PublicRoute =
  | { kind: "redirect"; location: string; permanent: boolean }
  | { kind: "serve"; locale: Locale }
  | null;

/**
 * What the proxy does with a request for a localized public page.
 *
 * - `/pt…` → permanent redirect to the unprefixed URL (Portuguese has exactly one URL).
 * - `/en…`, `/it…` → serve in that locale, whatever the visitor's preference.
 * - Unprefixed → serve Portuguese, unless the visitor prefers another language:
 *   an explicit `locale` cookie, else their Accept-Language. That redirect is
 *   temporary and never fires for crawlers, which send neither — so `/` is the
 *   page Google indexes as Portuguese.
 * - Anything else → `null` (not a localized page; the app's own negotiation applies).
 */
export function routePublicRequest({
  pathname,
  search,
  cookieLocale,
  acceptLanguage,
}: {
  pathname: string;
  search: string;
  cookieLocale: string | undefined;
  acceptLanguage: string | null;
}): PublicRoute {
  const unprefixedPrefix = `/${UNPREFIXED_LOCALE}`;
  if (pathname === unprefixedPrefix || pathname.startsWith(`${unprefixedPrefix}/`)) {
    const basePath = pathname.slice(unprefixedPrefix.length) || "/";
    return isLocalizedPath(basePath) ? { kind: "redirect", location: basePath + search, permanent: true } : null;
  }

  const parsed = parseLocalizedPath(pathname);
  if (!parsed) return null;
  if (parsed.locale !== UNPREFIXED_LOCALE) return { kind: "serve", locale: parsed.locale };

  const preferred = isSupportedLocale(cookieLocale)
    ? cookieLocale
    : acceptLanguage
      ? localeFromAcceptLanguage(acceptLanguage)
      : UNPREFIXED_LOCALE;

  if (preferred === UNPREFIXED_LOCALE) return { kind: "serve", locale: UNPREFIXED_LOCALE };
  return { kind: "redirect", location: localizedPath(preferred, parsed.basePath) + search, permanent: false };
}
