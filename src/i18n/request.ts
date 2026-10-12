import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isSupportedLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from "./locales";
import { LOCALE_REQUEST_HEADER } from "./routing";

export { SUPPORTED_LOCALES, type Locale } from "./locales";

// On the localized public pages (`/`, `/en`, `/it/privacy`, … — see
// ./routing.ts) the URL decides: the proxy forwards it as a request header,
// which wins over everything else. Everywhere else it's cookie-based with no
// URL segment — an explicit choice (the "locale" cookie, set by the language
// switcher) wins; otherwise we detect from the browser's Accept-Language
// header, honouring its q-weighted order. No cookie is set until the user
// actively picks a language, so detection stays live off the browser until
// then.
//
// Exported (not just used inline below) so Route Handlers that generate
// locale-aware content outside the message-bundle system (e.g. the product
// import template's example row) can resolve the same locale without
// duplicating this detection logic.
export async function resolveLocale(): Promise<Locale> {
  const headerStore = await headers();
  const urlLocale = headerStore.get(LOCALE_REQUEST_HEADER);
  if (isSupportedLocale(urlLocale)) {
    return urlLocale;
  }

  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;

  if (isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }
  return localeFromAcceptLanguage(headerStore.get("accept-language"));
}

// An explicit `getTranslations({ locale })` (e.g. /llms.txt, which is always
// Portuguese) arrives as `locale` and wins over the request's own locale.
export default getRequestConfig(async ({ locale: explicit }) => {
  const locale = isSupportedLocale(explicit) ? explicit : await resolveLocale();

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
