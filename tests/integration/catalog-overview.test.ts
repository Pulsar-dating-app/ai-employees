import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { ProductRepository } from "@/lib/products/repository";
import { buildCatalogOverviewSection } from "@/lib/agent-engine/prompt";

// 2026-09-27 -- the catalog overview Malu reads on every turn: an exact count
// of ACTIVE products of THIS company, with their categories, in one query.
describe("ProductRepository.catalogOverview", () => {
  async function createCompany(cookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", cookie, { name });
    return created.json.company.id;
  }

  async function createProduct(cookie: string, companyId: string, body: Record<string, unknown>) {
    const res = await api<{ product: { id: string } }>("POST", `/api/companies/${companyId}/products`, cookie, body);
    return res.json.product.id;
  }

  it("summarizes only this company's active products", async () => {
    const owner = await signUpTestUser("owner");
    const other = await signUpTestUser("other");
    const companyId = await createCompany(owner.cookieHeader, "Plans Co");
    const otherId = await createCompany(other.cookieHeader, "Other Co");

    await createProduct(owner.cookieHeader, companyId, { name: "Starter — Mensal", category: "Planos", price: 930, currency: "BRL" });
    await createProduct(owner.cookieHeader, companyId, { name: "Pro — Mensal", category: "Planos", price: 999, currency: "BRL" });
    const retired = await createProduct(owner.cookieHeader, companyId, { name: "Legacy", category: "Antigos" });
    await api("DELETE", `/api/companies/${companyId}/products/${retired}`, owner.cookieHeader);
    await createProduct(other.cookieHeader, otherId, { name: "Camiseta", category: "Roupas" });

    const overview = await ProductRepository.catalogOverview(companyId, getTestServiceClient());
    expect(overview.total).toBe(2);
    expect(overview.categories).toEqual([{ name: "Planos", count: 2 }]);
    expect(overview.countsComplete).toBe(true);
    expect([...overview.examples].sort()).toEqual(["Pro — Mensal", "Starter — Mensal"]);
    expect(buildCatalogOverviewSection(overview)).toContain("Planos (2)");
  });

  it("reports an empty catalog as total 0 (the empty-catalog signal)", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Empty Co");
    const overview = await ProductRepository.catalogOverview(companyId, getTestServiceClient());
    expect(overview).toEqual({ total: 0, categories: [], countsComplete: true, examples: [] });
    expect(buildCatalogOverviewSection(overview)).toBeNull();
  });
});
