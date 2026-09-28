import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isSupportedLocale, localeFromAcceptLanguage, type Locale } from "./locales";

export { SUPPORTED_LOCALES, type Locale } from "./locales";

// Cookie-based, no [locale] URL segment — an explicit choice (the "locale"
// cookie, set by the language switcher) always wins; otherwise we detect
// from the browser's Accept-Language header, honouring its q-weighted order.
// No cookie is set until the user actively picks a language, so detection
// stays live off the browser until then.
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
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
