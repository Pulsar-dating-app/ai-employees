"use server";

import { cookies } from "next/headers";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/request";

export async function setLocale(locale: Locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;

  const store = await cookies();
  store.set("locale", locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
}
