import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello ticket B5 — ProductRepository, exercised through the thin
// /search HTTP route (see its file comment for why there's a route at all).
describe("Product search /api/companies/:id/products/search", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function createProduct(cookie: string, companyId: string, body: Record<string, unknown>) {
    const res = await api<{ product: { id: string } }>(
      "POST",
      `/api/companies/${companyId}/products`,
      cookie,
      body,
    );
    return res.json.product.id;
  }

  function search(cookie: string, companyId: string, query: string) {
    return api<{ products: { id: string; name: string }[] }>(
      "GET",
      `/api/companies/${companyId}/products/search${query}`,
      cookie,
    );
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check Co");

    expect((await api("GET", `/api/companies/${companyId}/products/search`)).status).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only Co");

    expect((await search(outsider.cookieHeader, companyId, "")).status).toBe(403);
  });

  it("only returns the requesting company's products, excluding soft-deleted ones", async () => {
    const owner = await signUpTestUser("owner");
    const companyA = await createCompany(owner.cookieHeader, "Company A");
    const companyB = await createCompany(owner.cookieHeader, "Company B");

    const activeInA = await createProduct(owner.cookieHeader, companyA, { name: "Blue Widget" });
    const inactiveInA = await createProduct(owner.cookieHeader, companyA, { name: "Retired Widget" });
    await api("DELETE", `/api/companies/${companyA}/products/${inactiveInA}`, owner.cookieHeader);
    await createProduct(owner.cookieHeader, companyB, { name: "Blue Widget" });

    const res = await search(owner.cookieHeader, companyA, "");
    expect(res.status).toBe(200);
    const ids = res.json.products.map((p) => p.id);
    expect(ids).toContain(activeInA);
    expect(ids).not.toContain(inactiveInA);
    expect(ids).toHaveLength(1);
  });

  it("text search ranks a name match above a description-only match", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Ranking Co");

    const nameMatch = await createProduct(owner.cookieHeader, companyId, {
      name: "Lantern",
      description: "A camping accessory",
    });
    const descriptionMatch = await createProduct(owner.cookieHeader, companyId, {
      name: "Camping Stove",
      description: "Great for a lantern-lit evening",
    });
    await createProduct(owner.cookieHeader, companyId, { name: "Unrelated Tent" });

    const res = await search(owner.cookieHeader, companyId, "?text=lantern");
    expect(res.status).toBe(200);
    expect(res.json.products.map((p) => p.id)).toEqual([nameMatch, descriptionMatch]);
  });

  // Regression test for a real bug found manually testing Malu: a customer
  // asked for "camiseta azul" and Malu reported no results even though a
  // matching product existed, because the old single-phrase `%text%` match
  // required "camiseta azul" to appear as one literal substring -- it
  // doesn't when the words are split across name/description (or when an
  // LLM-driven caller adds extra descriptive words the customer used, like
  // "camiseta azul masculina"). Each word is now matched independently
  // (AND across words, OR across fields per word), not as one phrase.
  it("text search matches when query words are split across name and description, in any order", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Tokenized Search Co");

    const match = await createProduct(owner.cookieHeader, companyId, {
      name: "Camiseta",
      description: "Disponível nas cores azul e branco",
    });
    await createProduct(owner.cookieHeader, companyId, { name: "Camiseta Branca" });
    await createProduct(owner.cookieHeader, companyId, { name: "Calça Azul" });

    const res = await search(owner.cookieHeader, companyId, "?text=camiseta%20azul");
    expect(res.status).toBe(200);
    expect(res.json.products.map((p) => p.id)).toEqual([match]);
  });

  it("text search still requires every word to match -- doesn't degrade into matching any word", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Strict Tokenized Search Co");

    await createProduct(owner.cookieHeader, companyId, { name: "Camiseta Azul" });

    const res = await search(owner.cookieHeader, companyId, "?text=camiseta%20azul%20masculina");
    expect(res.status).toBe(200);
    expect(res.json.products).toEqual([]);
  });

  // Trello: LLM keyword expansion (see 2026-08-27 decisions.md). Unlike
  // ?text=, which ANDs every word of one phrase together, ?keywords= (one
  // per query param) matches if ANY keyword matches -- this is what lets
  // the search_products agent tool pass a few alternative phrasings for
  // the same request and still find a product that matches only one of them.
  it("?keywords= (repeated) matches if ANY keyword matches, unlike ?text=", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Keyword OR Co");

    const match = await createProduct(owner.cookieHeader, companyId, { name: "Camiseta Azul" });
    await createProduct(owner.cookieHeader, companyId, { name: "Sapato Marrom" });

    // Neither keyword alone as a `text` AND-phrase would match "Camiseta
    // Azul" ("masculina" isn't in it) -- but as independent OR'd
    // alternatives, the second keyword does.
    const res = await search(
      owner.cookieHeader,
      companyId,
      "?keywords=camiseta+masculina&keywords=camiseta+azul",
    );
    expect(res.status).toBe(200);
    expect(res.json.products.map((p) => p.id)).toEqual([match]);
  });

  it("filters by category and price range", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Filter Co");

    const cheapShirt = await createProduct(owner.cookieHeader, companyId, {
      name: "Cheap Shirt",
      category: "shirts",
      price: 10,
      currency: "USD",
    });
    await createProduct(owner.cookieHeader, companyId, {
      name: "Pricey Shirt",
      category: "shirts",
      price: 100,
      currency: "USD",
    });
    await createProduct(owner.cookieHeader, companyId, {
      name: "Cheap Hat",
      category: "hats",
      price: 10,
      currency: "USD",
    });

    const res = await search(owner.cookieHeader, companyId, "?category=shirts&priceMax=20");
    expect(res.status).toBe(200);
    expect(res.json.products.map((p) => p.id)).toEqual([cheapShirt]);
  });

  it("filters by attributes containment", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Attributes Co");

    const blueOne = await createProduct(owner.cookieHeader, companyId, {
      name: "Widget A",
      attributes: { color: "blue", material: "plastic" },
    });
    await createProduct(owner.cookieHeader, companyId, {
      name: "Widget B",
      attributes: { color: "red", material: "plastic" },
    });

    const res = await search(
      owner.cookieHeader,
      companyId,
      `?attributes=${encodeURIComponent(JSON.stringify({ color: "blue" }))}`,
    );
    expect(res.status).toBe(200);
    expect(res.json.products.map((p) => p.id)).toEqual([blueOne]);
  });

  it("caps results at the requested limit", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Limit Co");

    for (let i = 0; i < 3; i++) {
      await createProduct(owner.cookieHeader, companyId, { name: `Widget ${i}` });
    }

    const res = await search(owner.cookieHeader, companyId, "?limit=2");
    expect(res.status).toBe(200);
    expect(res.json.products).toHaveLength(2);
  });

  it("rejects a non-numeric priceMin/priceMax/limit", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Params Co");

    expect((await search(owner.cookieHeader, companyId, "?priceMin=abc")).status).toBe(400);
    expect((await search(owner.cookieHeader, companyId, "?priceMax=abc")).status).toBe(400);
    expect((await search(owner.cookieHeader, companyId, "?limit=abc")).status).toBe(400);
  });

  it("rejects malformed attributes JSON", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Attributes Co");

    expect((await search(owner.cookieHeader, companyId, "?attributes={not-json")).status).toBe(400);
  });

  it("?productId= looks up a single product directly, scoped to the company", async () => {
    const owner = await signUpTestUser("owner");
    const companyA = await createCompany(owner.cookieHeader, "Company A2");
    const companyB = await createCompany(owner.cookieHeader, "Company B2");
    const productId = await createProduct(owner.cookieHeader, companyA, { name: "Direct Lookup Widget" });

    const found = await search(owner.cookieHeader, companyA, `?productId=${productId}`);
    expect(found.status).toBe(200);
    expect(found.json.products.map((p) => p.id)).toEqual([productId]);

    const wrongCompany = await search(owner.cookieHeader, companyB, `?productId=${productId}`);
    expect(wrongCompany.status).toBe(200);
    expect(wrongCompany.json.products).toEqual([]);
  });

  it("?productId= for a soft-deleted product returns empty, not the product", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Soft Delete Lookup Co");
    const productId = await createProduct(owner.cookieHeader, companyId, { name: "Doomed Widget" });
    await api("DELETE", `/api/companies/${companyId}/products/${productId}`, owner.cookieHeader);

    const res = await search(owner.cookieHeader, companyId, `?productId=${productId}`);
    expect(res.status).toBe(200);
    expect(res.json.products).toEqual([]);
  });

  it("text search containing a comma/quote doesn't break the query", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Special Chars Co");
    await createProduct(owner.cookieHeader, companyId, { name: `Widget, "Deluxe"` });

    const res = await search(owner.cookieHeader, companyId, `?text=${encodeURIComponent(`, "Deluxe`)}`);
    expect(res.status).toBe(200);
    expect(res.json.products).toHaveLength(1);
  });
});
