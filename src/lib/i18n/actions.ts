"use server";

import { cookies } from "next/headers";
import { isSupportedLocale, LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS, type Locale } from "@/i18n/locales";

export async function setLocale(locale: Locale) {
  if (!isSupportedLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS);
}
