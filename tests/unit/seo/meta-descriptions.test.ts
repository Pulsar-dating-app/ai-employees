import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import { COMPANY } from "@/lib/seo/site";

const MAX_LENGTH = 160;

function collectDescriptions(value: unknown, keyPath: string[] = []): [string, string][] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = [...keyPath, key];
    if (typeof child === "string") {
      const isDescription = key === "seoDescription" || childPath.join(".") === "Seo.description";
      return isDescription ? [[childPath.join("."), child] as [string, string]] : [];
    }
    return collectDescriptions(child, childPath);
  });
}

function render(template: string): string {
  return template.replace("{legalName}", COMPANY.legalName).replace("{taxId}", COMPANY.taxId);
}

describe("meta descriptions", () => {
  it.each(SUPPORTED_LOCALES)("%s stays within the length search engines display", (locale) => {
    const messages = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, `../../../messages/${locale}.json`), "utf8"),
    );
    const descriptions = collectDescriptions(messages);
    expect(descriptions.length).toBeGreaterThan(0);

    const tooLong = descriptions
      .map(([key, text]) => [key, render(text).length] as const)
      .filter(([, length]) => length > MAX_LENGTH);
    expect(tooLong).toEqual([]);
  });
});
