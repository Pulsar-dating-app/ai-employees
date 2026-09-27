// 2026-09-27 -- a short picture of what a business sells, handed to Malu on
// every turn (see prompt.ts buildCatalogOverviewSection and decisions.md
// "Malu gets a catalog overview"). Found in testing: on a catalog of SaaS
// plans, "vocês não têm o preço dos planos?" got "não tenho os valores" twice
// -- the model never searched, because nothing told it "planos" were the
// products. Knowing the catalog's categories and a few names up front removes
// that guess, the same fix that worked for policies and the FAQ.
//
// Pure: the repository feeds it a bounded sample, so a 2000-item store costs
// the prompt the same as a 13-item one.

export const MAX_OVERVIEW_CATEGORIES = 10;
export const MAX_OVERVIEW_EXAMPLES = 8;
const MAX_EXAMPLE_NAME_LENGTH = 80;

export type CatalogOverview = {
  // Active products in the whole catalog (exact).
  total: number;
  // Most common categories, most frequent first. `count` is exact only when
  // `countsComplete` (the sample covered the whole catalog).
  categories: { name: string; count: number }[];
  countsComplete: boolean;
  // A few product names, spread across categories.
  examples: string[];
};

type Row = { name: string | null; category: string | null };

function clean(value: string | null): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? text : null;
}

export function summarizeCatalog(rows: readonly Row[], total: number): CatalogOverview {
  const byCategory = new Map<string, string[]>();
  const uncategorized: string[] = [];
  for (const row of rows) {
    const name = clean(row.name);
    if (!name) continue;
    const category = clean(row.category);
    if (category) byCategory.set(category, [...(byCategory.get(category) ?? []), name]);
    else uncategorized.push(name);
  }

  const categories = [...byCategory.entries()]
    .map(([name, names]) => ({ name, count: names.length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_OVERVIEW_CATEGORIES);

  // Round-robin across the listed categories (then the uncategorized), so
  // the examples show the catalog's range rather than one category's top.
  const queues = [...categories.map((c) => [...(byCategory.get(c.name) ?? [])]), [...uncategorized]];
  const examples: string[] = [];
  const seen = new Set<string>();
  while (examples.length < MAX_OVERVIEW_EXAMPLES && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (!next) continue;
      const key = next.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      examples.push(next.length > MAX_EXAMPLE_NAME_LENGTH ? `${next.slice(0, MAX_EXAMPLE_NAME_LENGTH - 1)}…` : next);
      if (examples.length >= MAX_OVERVIEW_EXAMPLES) break;
    }
  }

  return { total, categories, countsComplete: rows.length >= total, examples };
}
