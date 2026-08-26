import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const SUPPORTED_LOCALES = ["en", "pt"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(value: string | undefined): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// Cookie-based, no [locale] URL segment — an explicit choice (the "locale"
// cookie, set by the language switcher) always wins; otherwise we detect
// from the browser's Accept-Language header. No cookie is set until the
// user actively picks a language, so detection stays live off the browser
// until then.
//
// Exported (not just used inline below) so Route Handlers that generate
// locale-aware content outside the message-bundle system (e.g. the product
// import template's example row) can resolve the same locale without
// duplicating this detection logic.
export async function resolveLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get("locale")?.value;

  if (isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }
  if ((await headers()).get("accept-language")?.toLowerCase().includes("pt")) {
    return "pt";
  }
  return "en";
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
