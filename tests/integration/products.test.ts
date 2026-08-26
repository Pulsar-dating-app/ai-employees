import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello ticket B3 — product catalog CRUD, scoped to company_id.
describe("Products CRUD /api/companies/:id/products", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function createProduct(cookie: string, companyId: string, body: Record<string, unknown>) {
    return api<{ product: { id: string } }>(
      "POST",
      `/api/companies/${companyId}/products`,
      cookie,
      body,
    );
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check Co");

    expect((await api("GET", `/api/companies/${companyId}/products`)).status).toBe(401);
    expect((await api("POST", `/api/companies/${companyId}/products`)).status).toBe(401);
    expect((await api("PATCH", `/api/companies/${companyId}/products/00000000-0000-0000-0000-000000000000`)).status).toBe(401);
    expect((await api("DELETE", `/api/companies/${companyId}/products/00000000-0000-0000-0000-000000000000`)).status).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only Co");
    const created = await createProduct(owner.cookieHeader, companyId, { name: "Widget" });

    expect((await api("GET", `/api/companies/${companyId}/products`, outsider.cookieHeader)).status).toBe(403);
    expect((await api("POST", `/api/companies/${companyId}/products`, outsider.cookieHeader, { name: "X" })).status).toBe(403);
    expect(
      (
        await api(
          "PATCH",
          `/api/companies/${companyId}/products/${created.json.product.id}`,
          outsider.cookieHeader,
          { name: "Y" },
        )
      ).status,
    ).toBe(403);
    expect(
      (await api("DELETE", `/api/companies/${companyId}/products/${created.json.product.id}`, outsider.cookieHeader)).status,
    ).toBe(403);
  });

  it("rejects creation without a name", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "No Name Co");

    const res = await createProduct(owner.cookieHeader, companyId, { price: 10, currency: "USD" });
    expect(res.status).toBe(400);
  });

  it("rejects a negative price", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Negative Price Co");

    const res = await createProduct(owner.cookieHeader, companyId, { name: "Widget", price: -1, currency: "USD" });
    expect(res.status).toBe(400);
  });

  it("rejects a price without a currency", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "No Currency Co");

    const res = await createProduct(owner.cookieHeader, companyId, { name: "Widget", price: 10 });
    expect(res.status).toBe(400);
  });

  it("creates a product and lists it for the company", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Catalog Co");

    const created = await createProduct(owner.cookieHeader, companyId, {
      name: "Widget",
      price: 19.99,
      currency: "USD",
      sku: "WID-1",
    });
    expect(created.status).toBe(201);
    expect(created.json.product).toMatchObject({ name: "Widget", sku: "WID-1" });

    const list = await api<{ products: { id: string }[] }>(
      "GET",
      `/api/companies/${companyId}/products`,
      owner.cookieHeader,
    );
    expect(list.status).toBe(200);
    expect(list.json.products.map((p) => p.id)).toContain(created.json.product.id);
  });

  it("creates a product with every field populated and persists all of them", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Full Fields Co");

    const body = {
      name: "Full Widget",
      external_id: "ext-123",
      sku: "WID-FULL",
      description: "A widget with every field set",
      price: 99.9,
      currency: "BRL",
      image_url: "https://example.test/widget.png",
      product_url: "https://example.test/products/widget",
      category: "widgets",
      variants: [{ color: "blue", size: "M" }],
      attributes: { material: "plastic" },
      metadata: { imported_from: "csv" },
    };

    const created = await api<{ product: Record<string, unknown> }>(
      "POST",
      `/api/companies/${companyId}/products`,
      owner.cookieHeader,
      body,
    );
    expect(created.status).toBe(201);

    const { price, ...rest } = body;
    expect(created.json.product).toMatchObject(rest);
    expect(Number(created.json.product.price)).toBe(price);
  });

  it("404s updating/deleting a product that doesn't exist or belongs to another company", async () => {
    const owner = await signUpTestUser("owner");
    const companyA = await createCompany(owner.cookieHeader, "Company A");
    const companyB = await createCompany(owner.cookieHeader, "Company B");
    const productInA = await createProduct(owner.cookieHeader, companyA, { name: "A's Widget" });

    const patchMissing = await api(
      "PATCH",
      `/api/companies/${companyA}/products/00000000-0000-0000-0000-000000000000`,
      owner.cookieHeader,
      { name: "X" },
    );
    expect(patchMissing.status).toBe(404);

    const patchWrongCompany = await api(
      "PATCH",
      `/api/companies/${companyB}/products/${productInA.json.product.id}`,
      owner.cookieHeader,
      { name: "X" },
    );
    expect(patchWrongCompany.status).toBe(404);

    const deleteWrongCompany = await api(
      "DELETE",
      `/api/companies/${companyB}/products/${productInA.json.product.id}`,
      owner.cookieHeader,
    );
    expect(deleteWrongCompany.status).toBe(404);
  });

  it("updates a product, validating price/currency against the effective merged state", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Update Co");
    const created = await createProduct(owner.cookieHeader, companyId, {
      name: "Widget",
      price: 10,
      currency: "USD",
    });
    const productId = created.json.product.id;

    // Removing currency while price is still set (unchanged) must fail even
    // though this request doesn't touch price directly.
    const badUpdate = await api(
      "PATCH",
      `/api/companies/${companyId}/products/${productId}`,
      owner.cookieHeader,
      { currency: null },
    );
    expect(badUpdate.status).toBe(400);

    const goodUpdate = await api<{ product: { name: string; price: number } }>(
      "PATCH",
      `/api/companies/${companyId}/products/${productId}`,
      owner.cookieHeader,
      { name: "Updated Widget", price: 25 },
    );
    expect(goodUpdate.status).toBe(200);
    expect(goodUpdate.json.product.name).toBe("Updated Widget");
    expect(Number(goodUpdate.json.product.price)).toBe(25);
  });

  it("soft-deletes a product: excluded from the default list, visible with includeInactive, idempotent", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Soft Delete Co");
    const created = await createProduct(owner.cookieHeader, companyId, { name: "Doomed Widget" });
    const productId = created.json.product.id;

    const deleted = await api<{ product: { is_active: boolean } }>(
      "DELETE",
      `/api/companies/${companyId}/products/${productId}`,
      owner.cookieHeader,
    );
    expect(deleted.status).toBe(200);
    expect(deleted.json.product.is_active).toBe(false);

    const defaultList = await api<{ products: { id: string }[] }>(
      "GET",
      `/api/companies/${companyId}/products`,
      owner.cookieHeader,
    );
    expect(defaultList.json.products.map((p) => p.id)).not.toContain(productId);

    const fullList = await api<{ products: { id: string }[] }>(
      "GET",
      `/api/companies/${companyId}/products?includeInactive=true`,
      owner.cookieHeader,
    );
    expect(fullList.json.products.map((p) => p.id)).toContain(productId);

    // Calling delete again on an already-inactive product is a no-op, not an error.
    const deletedAgain = await api(
      "DELETE",
      `/api/companies/${companyId}/products/${productId}`,
      owner.cookieHeader,
    );
    expect(deletedAgain.status).toBe(200);
  });

  it("reactivates a soft-deleted product via PATCH is_active, and rejects a non-boolean value", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Reactivate Co");
    const created = await createProduct(owner.cookieHeader, companyId, { name: "Revivable Widget" });
    const productId = created.json.product.id;

    await api("DELETE", `/api/companies/${companyId}/products/${productId}`, owner.cookieHeader);

    const badReactivate = await api(
      "PATCH",
      `/api/companies/${companyId}/products/${productId}`,
      owner.cookieHeader,
      { is_active: "yes" },
    );
    expect(badReactivate.status).toBe(400);

    const reactivated = await api<{ product: { is_active: boolean } }>(
      "PATCH",
      `/api/companies/${companyId}/products/${productId}`,
      owner.cookieHeader,
      { is_active: true },
    );
    expect(reactivated.status).toBe(200);
    expect(reactivated.json.product.is_active).toBe(true);

    const defaultList = await api<{ products: { id: string }[] }>(
      "GET",
      `/api/companies/${companyId}/products`,
      owner.cookieHeader,
    );
    expect(defaultList.json.products.map((p) => p.id)).toContain(productId);
  });
});
