import { describe, expect, it } from "vitest";
import {
  languageAlternates,
  localizeHref,
  localizedAlternates,
  localizedPath,
  parseLocalizedPath,
  routePublicRequest,
  shouldPinLocaleCookie,
} from "@/i18n/routing";

describe("localizedPath / parseLocalizedPath", () => {
  it("leaves Portuguese unprefixed and prefixes the other locales", () => {
    expect(localizedPath("pt", "/")).toBe("/");
    expect(localizedPath("pt", "/privacy")).toBe("/privacy");
    expect(localizedPath("en", "/")).toBe("/en");
    expect(localizedPath("it", "/terms")).toBe("/it/terms");
  });

  it("round-trips every localized page", () => {
    for (const locale of ["pt", "en", "it"] as const) {
      for (const basePath of ["/", "/privacy", "/terms"] as const) {
        expect(parseLocalizedPath(localizedPath(locale, basePath))).toEqual({ locale, basePath });
      }
    }
  });

  it("returns null for anything that isn't a localized public page", () => {
    expect(parseLocalizedPath("/dashboard")).toBeNull();
    expect(parseLocalizedPath("/en/dashboard")).toBeNull();
    expect(parseLocalizedPath("/fr")).toBeNull();
    // Portuguese has exactly one URL — the prefixed form isn't a page of its own.
    expect(parseLocalizedPath("/pt")).toBeNull();
    expect(parseLocalizedPath("/pt/privacy")).toBeNull();
  });
});

describe("localizeHref", () => {
  it("prefixes localized pages and keeps query and hash", () => {
    expect(localizeHref("en", "/?auth=signup")).toBe("/en?auth=signup");
    expect(localizeHref("it", "/privacy#cookies")).toBe("/it/privacy#cookies");
    expect(localizeHref("pt", "/?auth=login")).toBe("/?auth=login");
  });

  it("leaves anchors, app routes and external links alone", () => {
    expect(localizeHref("en", "#planos")).toBe("#planos");
    expect(localizeHref("en", "/talk/staffra-2/malu")).toBe("/talk/staffra-2/malu");
    expect(localizeHref("en", "https://example.com/")).toBe("https://example.com/");
  });
});

describe("hreflang alternates", () => {
  it("lists every language plus x-default on the Portuguese page", () => {
    expect(languageAlternates("/privacy")).toEqual({
      "pt-BR": "/privacy",
      en: "/en/privacy",
      it: "/it/privacy",
      "x-default": "/privacy",
    });
  });

  it("is self-canonical per locale", () => {
    expect(localizedAlternates("/", "en").canonical).toBe("/en");
    expect(localizedAlternates("/", "pt").canonical).toBe("/");
  });

  it("can build absolute URLs for the sitemap", () => {
    expect(languageAlternates("/", (p) => `https://www.staffra.io${p}`)["x-default"]).toBe("https://www.staffra.io/");
  });
});

describe("routePublicRequest", () => {
  const base = { search: "", cookieLocale: undefined, acceptLanguage: null };

  it("serves Portuguese at the unprefixed URL to crawlers (no cookie, no Accept-Language)", () => {
    expect(routePublicRequest({ ...base, pathname: "/" })).toEqual({ kind: "serve", locale: "pt" });
    expect(routePublicRequest({ ...base, pathname: "/terms" })).toEqual({ kind: "serve", locale: "pt" });
  });

  it("serves a prefixed URL in its own locale regardless of preference", () => {
    expect(
      routePublicRequest({ ...base, pathname: "/en", cookieLocale: "pt", acceptLanguage: "pt-BR" }),
    ).toEqual({ kind: "serve", locale: "en" });
    expect(routePublicRequest({ ...base, pathname: "/it/privacy" })).toEqual({ kind: "serve", locale: "it" });
  });

  it("redirects unprefixed pages to the visitor's preferred language, keeping the query", () => {
    expect(
      routePublicRequest({ ...base, pathname: "/", search: "?auth=signup", acceptLanguage: "en-US,en;q=0.9" }),
    ).toEqual({ kind: "redirect", location: "/en?auth=signup", permanent: false });
    expect(routePublicRequest({ ...base, pathname: "/privacy", cookieLocale: "it" })).toEqual({
      kind: "redirect",
      location: "/it/privacy",
      permanent: false,
    });
  });

  it("lets an explicit cookie beat Accept-Language", () => {
    expect(
      routePublicRequest({ ...base, pathname: "/", cookieLocale: "pt", acceptLanguage: "en-US" }),
    ).toEqual({ kind: "serve", locale: "pt" });
  });

  it("permanently folds /pt URLs into the unprefixed ones", () => {
    expect(routePublicRequest({ ...base, pathname: "/pt", search: "?auth=login" })).toEqual({
      kind: "redirect",
      location: "/?auth=login",
      permanent: true,
    });
    expect(routePublicRequest({ ...base, pathname: "/pt/terms" })).toEqual({
      kind: "redirect",
      location: "/terms",
      permanent: true,
    });
  });

  it("ignores everything that isn't a localized public page", () => {
    expect(routePublicRequest({ ...base, pathname: "/dashboard", acceptLanguage: "en" })).toBeNull();
    expect(routePublicRequest({ ...base, pathname: "/pt/dashboard" })).toBeNull();
    expect(routePublicRequest({ ...base, pathname: "/en/dashboard" })).toBeNull();
  });
});

describe("shouldPinLocaleCookie", () => {
  it("leaves the cookie alone when the app would already resolve the same language", () => {
    expect(shouldPinLocaleCookie({ served: "pt", cookieLocale: undefined, acceptLanguage: "pt-BR" })).toBe(false);
    expect(shouldPinLocaleCookie({ served: "en", cookieLocale: "en", acceptLanguage: "pt-BR" })).toBe(false);
  });

  it("pins the served language when cookie or browser would disagree", () => {
    expect(shouldPinLocaleCookie({ served: "en", cookieLocale: undefined, acceptLanguage: "pt-BR" })).toBe(true);
    expect(shouldPinLocaleCookie({ served: "it", cookieLocale: "pt", acceptLanguage: "it-IT" })).toBe(true);
    // No Accept-Language falls back to English in the app, so a Portuguese page pins pt.
    expect(shouldPinLocaleCookie({ served: "pt", cookieLocale: undefined, acceptLanguage: null })).toBe(true);
  });
});

describe("per-trade pages", () => {
  it("are localized public pages in every language", () => {
    expect(parseLocalizedPath("/para/barbearias")).toEqual({ locale: "pt", basePath: "/para/barbearias" });
    expect(parseLocalizedPath("/en/para/clinicas-odontologicas")).toEqual({
      locale: "en",
      basePath: "/para/clinicas-odontologicas",
    });
    expect(parseLocalizedPath("/para/unknown")).toBeNull();
    expect(localizedPath("it", "/para/barbearias")).toBe("/it/para/barbearias");
  });

  it("redirect to the visitor's language like the home page", () => {
    expect(
      routePublicRequest({ pathname: "/para/barbearias", search: "", cookieLocale: "en", acceptLanguage: null }),
    ).toEqual({ kind: "redirect", location: "/en/para/barbearias", permanent: false });
  });
});
