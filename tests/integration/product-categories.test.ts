import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

async function createCompany(ownerCookie: string, name: string) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
  return created.json.company.id;
}

async function createProduct(cookie: string, companyId: string, name: string, category: string | null) {
  const res = await api<{ product: { id: string } }>("POST", `/api/companies/${companyId}/products`, cookie, {
    name,
    category,
  });
  expect(res.status).toBe(201);
  return res.json.product.id;
}

describe("product_categories(): distinct active categories, scoped by RLS", () => {
  it("returns each active, non-blank category once, sorted, and skips deactivated products", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Categories Co");

    await createProduct(owner.cookieHeader, companyId, "Linen dress", "Dresses");
    await createProduct(owner.cookieHeader, companyId, "Silk dress", "Dresses");
    await createProduct(owner.cookieHeader, companyId, "Straw bag", "Accessories");
    await createProduct(owner.cookieHeader, companyId, "No category", null);
    const retired = await createProduct(owner.cookieHeader, companyId, "Old boot", "Shoes");
    const deactivated = await api("DELETE", `/api/companies/${companyId}/products/${retired}`, owner.cookieHeader);
    expect(deactivated.status).toBe(200);

    const { data, error } = await owner.client.rpc("product_categories", { p_company_id: companyId });
    expect(error).toBeNull();
    expect((data as { category: string }[]).map((r) => r.category)).toEqual(["Accessories", "Dresses"]);
  });

  it("returns nothing for a company the caller doesn't belong to", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Private Categories Co");
    await createProduct(owner.cookieHeader, companyId, "Secret item", "Secret");

    const outsider = await signUpTestUser("outsider");
    const { data, error } = await outsider.client.rpc("product_categories", { p_company_id: companyId });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
