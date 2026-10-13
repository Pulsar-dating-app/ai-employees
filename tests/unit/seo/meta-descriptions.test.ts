import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import { COMPANY } from "@/lib/seo/site";

const MAX_DESCRIPTION_LENGTH = 160;
const MAX_TITLE_LENGTH = 69;
const TITLE_SUFFIX = " · Staffra";

function collect(value: unknown, matches: (keyPath: string) => boolean, keyPath: string[] = []): [string, string][] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = [...keyPath, key];
    if (typeof child === "string") {
      return matches(childPath.join(".")) ? [[childPath.join("."), child] as [string, string]] : [];
    }
    return collect(child, matches, childPath);
  });
}

function render(template: string): string {
  return template.replace("{legalName}", COMPANY.legalName).replace("{taxId}", COMPANY.taxId);
}

function loadMessages(locale: string): unknown {
  return JSON.parse(readFileSync(path.resolve(import.meta.dirname, `../../../messages/${locale}.json`), "utf8"));
}

function overLimit(entries: [string, string][], limit: number) {
  return entries.map(([key, text]) => [key, text.length] as const).filter(([, length]) => length > limit);
}

describe("meta descriptions", () => {
  it.each(SUPPORTED_LOCALES)("%s stays within the length search engines display", (locale) => {
    const descriptions = collect(
      loadMessages(locale),
      (key) => key.endsWith(".seoDescription") || key === "Seo.description",
    ).map(([key, text]) => [key, render(text)] as [string, string]);
    expect(descriptions.length).toBeGreaterThan(0);
    expect(overLimit(descriptions, MAX_DESCRIPTION_LENGTH)).toEqual([]);
  });
});

describe("page titles", () => {
  it.each(SUPPORTED_LOCALES)("%s stays under the length Bing flags", (locale) => {
    const messages = loadMessages(locale);
    const homeTitle = collect(messages, (key) => key === "Seo.defaultTitle");
    const pageTitles = collect(messages, (key) => key.endsWith(".seoTitle")).map(
      ([key, text]) => [key, render(text) + TITLE_SUFFIX] as [string, string],
    );
    expect(homeTitle).toHaveLength(1);
    expect(overLimit([...homeTitle, ...pageTitles], MAX_TITLE_LENGTH)).toEqual([]);
  });
});
