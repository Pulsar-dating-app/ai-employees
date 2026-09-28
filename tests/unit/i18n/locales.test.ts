import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { intlTag, localeFromAcceptLanguage, SUPPORTED_LOCALES } from "@/i18n/locales";

describe("localeFromAcceptLanguage", () => {
  it("picks the highest-weighted supported language", () => {
    expect(localeFromAcceptLanguage("it-IT,it;q=0.9,en;q=0.8")).toBe("it");
    expect(localeFromAcceptLanguage("pt-BR,pt;q=0.9")).toBe("pt");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,pt;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("en;q=0.5,it;q=0.8")).toBe("it");
  });

  it("skips unsupported languages and q=0 entries", () => {
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,it;q=0.7")).toBe("it");
    expect(localeFromAcceptLanguage("pt;q=0,it;q=0.5")).toBe("it");
  });

  it("keeps header order when weights tie", () => {
    expect(localeFromAcceptLanguage("pt, it")).toBe("pt");
  });

  it("falls back to English", () => {
    expect(localeFromAcceptLanguage(null)).toBe("en");
    expect(localeFromAcceptLanguage("")).toBe("en");
    expect(localeFromAcceptLanguage("de-DE,fr;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("*")).toBe("en");
  });
});

describe("intlTag", () => {
  it("maps each locale to a regional tag and unknown values to English", () => {
    expect(intlTag("pt")).toBe("pt-BR");
    expect(intlTag("it")).toBe("it-IT");
    expect(intlTag("xx")).toBe("en-US");
  });
});

describe("message files", () => {
  function shape(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(shape);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
    }
    return typeof value;
  }

  const load = (locale: string) =>
    JSON.parse(readFileSync(path.resolve(import.meta.dirname, `../../../messages/${locale}.json`), "utf8"));
  const reference = shape(load("en"));

  it.each(SUPPORTED_LOCALES.filter((l) => l !== "en"))("%s has exactly the same keys as en", (locale) => {
    expect(shape(load(locale))).toEqual(reference);
  });
});
