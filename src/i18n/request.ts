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
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("locale")?.value;

  let locale: Locale = "en";
  if (isSupportedLocale(cookieLocale)) {
    locale = cookieLocale;
  } else if ((await headers()).get("accept-language")?.toLowerCase().includes("pt")) {
    locale = "pt";
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
