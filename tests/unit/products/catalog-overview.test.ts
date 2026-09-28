import { describe, expect, it } from "vitest";
import { MAX_OVERVIEW_CATEGORIES, MAX_OVERVIEW_EXAMPLES, summarizeCatalog } from "@/lib/products/catalog-overview";

// 2026-09-27 -- the "what this business sells" overview in Malu's prompt.
describe("summarizeCatalog", () => {
  it("counts categories exactly when the sample is the whole catalog", () => {
    const rows = [
      { name: "Staffra Starter — Mensal", category: "Planos" },
      { name: "Staffra Pro — Mensal", category: "Planos" },
      { name: "Setup assistido", category: "Serviços" },
    ];
    expect(summarizeCatalog(rows, 3)).toEqual({
      total: 3,
      categories: [
        { name: "Planos", count: 2 },
        { name: "Serviços", count: 1 },
      ],
      countsComplete: true,
      examples: ["Staffra Starter — Mensal", "Setup assistido", "Staffra Pro — Mensal"],
    });
  });

  it("marks counts as partial when the sample is smaller than the catalog", () => {
    const overview = summarizeCatalog([{ name: "Tênis", category: "Calçados" }], 2000);
    expect(overview.total).toBe(2000);
    expect(overview.countsComplete).toBe(false);
  });

  it("spreads examples across categories and includes uncategorized items", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => ({ name: `Camiseta ${i}`, category: "Roupas" })),
      { name: "Tênis Azul", category: "Calçados" },
      { name: "Vale-presente", category: null },
    ];
    const { examples } = summarizeCatalog(rows, rows.length);
    expect(examples.slice(0, 3)).toEqual(["Camiseta 0", "Tênis Azul", "Vale-presente"]);
    expect(examples).toHaveLength(MAX_OVERVIEW_EXAMPLES);
  });

  it("caps categories and examples, and skips blank or duplicate names", () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => ({ name: `Item ${i}`, category: `Cat ${i}` })),
      { name: "  ", category: "Cat 0" },
      { name: "item 1", category: "Cat 1" },
    ];
    const overview = summarizeCatalog(rows, rows.length);
    expect(overview.categories).toHaveLength(MAX_OVERVIEW_CATEGORIES);
    expect(overview.examples).toHaveLength(MAX_OVERVIEW_EXAMPLES);
    expect(new Set(overview.examples.map((e) => e.toLowerCase())).size).toBe(overview.examples.length);
  });

  it("shortens a very long name", () => {
    const { examples } = summarizeCatalog([{ name: "x".repeat(200), category: null }], 1);
    expect(examples[0].length).toBeLessThanOrEqual(80);
    expect(examples[0].endsWith("…")).toBe(true);
  });
});
