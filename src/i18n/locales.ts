export const SUPPORTED_LOCALES = ["en", "pt", "it"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_META: Record<Locale, { endonym: string; greeting: string; intlTag: string }> = {
  en: { endonym: "English", greeting: "Hello", intlTag: "en-US" },
  pt: { endonym: "Português", greeting: "Olá", intlTag: "pt-BR" },
  it: { endonym: "Italiano", greeting: "Ciao", intlTag: "it-IT" },
};

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function intlTag(locale: string): string {
  return isSupportedLocale(locale) ? LOCALE_META[locale].intlTag : LOCALE_META[DEFAULT_LOCALE].intlTag;
}

export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { primary: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.primary && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  const match = ranked.find((entry) => isSupportedLocale(entry.primary))?.primary;
  return isSupportedLocale(match) ? match : DEFAULT_LOCALE;
}
