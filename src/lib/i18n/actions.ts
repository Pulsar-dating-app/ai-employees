"use server";

import { cookies } from "next/headers";
import { isSupportedLocale, type Locale } from "@/i18n/locales";

export async function setLocale(locale: Locale) {
  if (!isSupportedLocale(locale)) return;

  const store = await cookies();
  store.set("locale", locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
}
