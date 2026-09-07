import { describe, expect, it } from "vitest";
import {
  buildFaqPage,
  buildLandingGraph,
  buildSoftwareApplication,
  parsePriceAmount,
} from "@/lib/seo/structured-data";

// The landing page's schema.org graph is built from the same message data
// the visible FAQ and pricing sections render. These tests pin the shapes
// Google's Rich Results validator cares about (FAQPage questions,
// SoftwareApplication offers) and the price-label parsing that separates a
// numeric plan from a "Custom" one.

describe("parsePriceAmount", () => {
  it("extracts the digits from a formatted price label", () => {
    expect(parsePriceAmount("R$ 399")).toBe("399");
    expect(parsePriceAmount("R$ 1.299 / mês")).toBe("1299");
  });

  it("returns null for a non-numeric label", () => {
    expect(parsePriceAmount("Custom")).toBeNull();
    expect(parsePriceAmount("Sob consulta")).toBeNull();
  });
});

describe("buildSoftwareApplication", () => {
  it("maps each plan to an Offer, pricing numeric plans and leaving custom ones open", () => {
    const node = buildSoftwareApplication("Staffra", "desc", [
      { name: "Mini", desc: "for small shops", price: "R$ 399" },
      { name: "Enterprise", price: "Customizado" },
    ]);

    expect(node["@type"]).toBe("SoftwareApplication");
    const offers = node.offers as Record<string, unknown>[];
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      "@type": "Offer",
      name: "Mini",
      description: "for small shops",
      price: "399",
      priceCurrency: "BRL",
    });
    expect(offers[1]).toMatchObject({ name: "Enterprise" });
    expect(offers[1].price).toBeUndefined();
  });

  it("omits the offers key entirely when there are no plans", () => {
    expect(buildSoftwareApplication("Staffra", "desc", [])).not.toHaveProperty("offers");
  });
});

describe("buildFaqPage", () => {
  it("turns entries into schema.org Question/Answer pairs", () => {
    const node = buildFaqPage([{ q: "How does it work?", a: "You upload files." }]);
    expect(node).toMatchObject({
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How does it work?",
          acceptedAnswer: { "@type": "Answer", text: "You upload files." },
        },
      ],
    });
  });

  it("returns null when there are no entries", () => {
    expect(buildFaqPage([])).toBeNull();
  });
});

describe("buildLandingGraph", () => {
  it("emits a schema.org @graph with the four core nodes", () => {
    const graph = buildLandingGraph({
      siteName: "Staffra",
      description: "desc",
      plans: [{ name: "Mini", price: "R$ 399" }],
      faq: [{ q: "q", a: "a" }],
    });

    expect(graph["@context"]).toBe("https://schema.org");
    const types = (graph["@graph"] as Record<string, unknown>[]).map((n) => n["@type"]);
    expect(types).toEqual(["Organization", "WebSite", "SoftwareApplication", "FAQPage"]);
  });

  it("drops the FAQPage node when there are no FAQ entries", () => {
    const graph = buildLandingGraph({
      siteName: "Staffra",
      description: "desc",
      plans: [],
      faq: [],
    });
    const types = (graph["@graph"] as Record<string, unknown>[]).map((n) => n["@type"]);
    expect(types).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
  });
});
