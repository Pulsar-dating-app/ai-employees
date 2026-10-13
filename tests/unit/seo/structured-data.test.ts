import { describe, expect, it } from "vitest";
import {
  buildAboutPageGraph,
  buildArticleGraph,
  buildFaqPage,
  buildLandingGraph,
  buildOrganization,
  buildSoftwareApplication,
  buildVerticalPageGraph,
  parsePriceAmount,
  SOFTWARE_ID,
  type SiteIdentity,
} from "@/lib/seo/structured-data";
import { COMPANY, SOCIAL_PROFILES } from "@/lib/seo/site";

// The public pages' schema.org graphs are built from the same message data
// the visible sections render. These tests pin the shapes search engines and
// AI assistants rely on: the company identity on the Organization, @id links
// that resolve within each page, priced offers, and the per-page node types.

type Node = Record<string, unknown>;
const site: SiteIdentity = { siteName: "Staffra", siteDescription: "site desc", orgDescription: "org desc" };
const nodes = (graph: Node) => graph["@graph"] as Node[];
const byType = (graph: Node, type: string) => nodes(graph).find((n) => n["@type"] === type)!;
const ids = (graph: Node) => new Set(nodes(graph).map((n) => n["@id"]).filter(Boolean));

/** Every {"@id": …} reference inside the graph points at a node the graph defines. */
function expectReferencesResolve(graph: Node) {
  const defined = ids(graph);
  const refs: string[] = [];
  const walk = (value: unknown, isRoot: boolean) => {
    if (Array.isArray(value)) value.forEach((v) => walk(v, false));
    else if (value && typeof value === "object") {
      const obj = value as Node;
      if (!isRoot && Object.keys(obj).length === 1 && typeof obj["@id"] === "string") refs.push(obj["@id"]);
      Object.values(obj).forEach((v) => walk(v, false));
    }
  };
  nodes(graph).forEach((n) => walk(n, true));
  for (const ref of refs) expect(defined.has(ref), `unresolved @id ${ref}`).toBe(true);
}

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

describe("buildOrganization", () => {
  const org = buildOrganization("Staffra", "What Staffra is");

  it("carries the legal identity that tells this Staffra apart from same-name companies", () => {
    expect(org).toMatchObject({
      "@type": "Organization",
      name: "Staffra",
      legalName: COMPANY.legalName,
      taxID: COMPANY.taxId,
      email: COMPANY.email,
      description: "What Staffra is",
      contactPoint: { "@type": "ContactPoint", email: COMPANY.email },
    });
  });

  it("uses a square logo of at least 112px", () => {
    const logo = org.logo as Node;
    expect(logo.width).toBe(logo.height);
    expect(logo.width as number).toBeGreaterThanOrEqual(112);
  });

  it("links the official social profiles as sameAs", () => {
    expect(org.sameAs).toEqual([...SOCIAL_PROFILES]);
  });
});

describe("buildSoftwareApplication", () => {
  it("prices numeric plans monthly in BRL and leaves custom ones open", () => {
    const node = buildSoftwareApplication("Staffra", "desc", [
      { name: "Mini", desc: "for small shops", price: "R$ 399" },
      { name: "Enterprise", price: "Customizado" },
    ]);

    expect(node).toMatchObject({ "@type": "SoftwareApplication", "@id": SOFTWARE_ID });
    const offers = node.offers as Node[];
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      "@type": "Offer",
      name: "Mini",
      description: "for small shops",
      price: "399",
      priceCurrency: "BRL",
      availability: "https://schema.org/InStock",
      priceSpecification: { "@type": "UnitPriceSpecification", unitCode: "MON" },
    });
    expect(offers[0].url).toEqual(expect.stringContaining("#planos"));
    expect(offers[1]).toMatchObject({ name: "Enterprise" });
    expect(offers[1].price).toBeUndefined();
  });

  it("omits the offers key entirely when there are no plans", () => {
    expect(buildSoftwareApplication("Staffra", "desc", [])).not.toHaveProperty("offers");
  });
});

describe("buildFaqPage", () => {
  it("turns entries into schema.org Question/Answer pairs", () => {
    expect(buildFaqPage([{ q: "How does it work?", a: "You upload files." }])).toMatchObject({
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "How does it work?", acceptedAnswer: { "@type": "Answer", text: "You upload files." } },
      ],
    });
  });

  it("returns null when there are no entries", () => {
    expect(buildFaqPage([])).toBeNull();
  });
});

describe("buildLandingGraph", () => {
  const graph = buildLandingGraph({
    site,
    url: "https://www.staffra.io/",
    name: "Staffra",
    inLanguage: "pt-BR",
    plans: [{ name: "Mini", price: "R$ 399" }],
    faq: [{ q: "q", a: "a" }],
  });

  it("describes the page, the product and its FAQ", () => {
    expect(graph["@context"]).toBe("https://schema.org");
    expect(nodes(graph).map((n) => n["@type"])).toEqual([
      "Organization",
      "WebSite",
      "WebPage",
      "SoftwareApplication",
      "FAQPage",
    ]);
    expect(byType(graph, "WebPage")).toMatchObject({ inLanguage: "pt-BR", mainEntity: { "@id": SOFTWARE_ID } });
    expectReferencesResolve(graph);
  });

  it("drops the FAQPage node when there are no FAQ entries", () => {
    const noFaq = buildLandingGraph({ site, url: "u", name: "n", inLanguage: "en", plans: [], faq: [] });
    expect(nodes(noFaq).map((n) => n["@type"])).not.toContain("FAQPage");
  });
});

describe("buildVerticalPageGraph", () => {
  const url = "https://www.staffra.io/para/barbearias";
  const graph = buildVerticalPageGraph({
    site,
    url,
    name: "Atendente virtual para barbearias",
    description: "Page description",
    inLanguage: "pt-BR",
    trade: "Barbearias",
    plans: [{ name: "Starter", price: "R$ 197" }],
    breadcrumbs: [
      { name: "Início", url: "https://www.staffra.io/" },
      { name: "Barbearias", url },
    ],
    video: {
      name: "Demo",
      description: "Video description",
      thumbnailUrl: "https://www.staffra.io/verticals/barbearia-poster.webp",
      contentUrl: "https://www.staffra.io/verticals/barbearia.mp4",
      uploadDate: "2026-10-12",
      duration: "PT37S",
    },
  });

  it("makes the page about the trade and links its breadcrumb, video and product", () => {
    expect(byType(graph, "WebPage")).toMatchObject({
      "@id": `${url}#webpage`,
      inLanguage: "pt-BR",
      about: { "@type": "Thing", name: "Barbearias" },
      mentions: { "@id": SOFTWARE_ID },
      breadcrumb: { "@id": `${url}#breadcrumb` },
      video: { "@id": `${url}#video` },
    });
    expectReferencesResolve(graph);
  });

  it("numbers breadcrumb positions from 1", () => {
    expect(byType(graph, "BreadcrumbList").itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Início", item: "https://www.staffra.io/" },
      { "@type": "ListItem", position: 2, name: "Barbearias", item: url },
    ]);
  });

  it("carries the fields Google requires on a VideoObject", () => {
    expect(byType(graph, "VideoObject")).toMatchObject({
      name: "Demo",
      description: "Video description",
      thumbnailUrl: expect.stringContaining("poster"),
      uploadDate: "2026-10-12",
      contentUrl: expect.stringContaining(".mp4"),
      inLanguage: "pt-BR",
    });
  });
});

describe("buildAboutPageGraph", () => {
  const url = "https://www.staffra.io/sobre";
  const graph = buildAboutPageGraph({
    site,
    url,
    name: "Sobre a Staffra",
    description: "d",
    inLanguage: "pt-BR",
    breadcrumbs: [
      { name: "Início", url: "https://www.staffra.io/" },
      { name: "Sobre", url },
    ],
  });

  it("is an AboutPage whose subject is the company", () => {
    const page = byType(graph, "AboutPage");
    expect(page).toBeDefined();
    expect((page.about as Node)["@id"]).toEqual(byType(graph, "Organization")["@id"]);
    expectReferencesResolve(graph);
  });
});

describe("buildArticleGraph", () => {
  const url = "https://www.staffra.io/guias/agendamento-automatico-whatsapp";
  const graph = buildArticleGraph({
    site,
    url,
    headline: "Agendamento automático pelo WhatsApp",
    description: "d",
    inLanguage: "pt-BR",
    datePublished: "2026-10-12",
    dateModified: "2026-10-12",
    breadcrumbs: [
      { name: "Início", url: "https://www.staffra.io/" },
      { name: "Guia", url },
    ],
  });

  it("is an Article written and published by the company, with dates", () => {
    const orgId = byType(graph, "Organization")["@id"];
    expect(byType(graph, "Article")).toMatchObject({
      headline: "Agendamento automático pelo WhatsApp",
      datePublished: "2026-10-12",
      dateModified: "2026-10-12",
      author: { "@id": orgId },
      publisher: { "@id": orgId },
    });
    expectReferencesResolve(graph);
  });
});
