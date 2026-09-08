import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Drives PostgREST directly (bypassing the Next.js app) to pin the two
// guarantees the connect routes assume: access_token is column-locked to
// the service role, and a store resolves to exactly one company. Same style
// as company-instagram-connections-rls.test.ts.
describe("company_shopify_connections", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  function connectionRow(companyId: string, shop: string) {
    return { company_id: companyId, shop_domain: shop, status: "connected" as const };
  }

  it("blocks even the company owner from selecting, inserting, or updating access_token / refresh_token directly", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Lock Co");

    const insert = await owner.client
      .from("company_shopify_connections")
      .insert(connectionRow(companyId, "lock-co.myshopify.com"));
    expect(insert.error).toBeNull();

    // Every other column stays readable -- only the two token columns are
    // locked; token_expires_at (non-secret) is not.
    const safeSelect = await owner.client
      .from("company_shopify_connections")
      .select("shop_domain, status, currency, token_expires_at")
      .eq("company_id", companyId);
    expect(safeSelect.error).toBeNull();
    expect(safeSelect.data).toHaveLength(1);

    for (const col of ["access_token", "refresh_token"] as const) {
      const sel = await owner.client
        .from("company_shopify_connections")
        .select(col)
        .eq("company_id", companyId);
      expect(sel.error?.code).toBe("42501");

      const upd = await owner.client
        .from("company_shopify_connections")
        .update({ [col]: "hijacked" })
        .eq("company_id", companyId)
        .select();
      expect(upd.error?.code).toBe("42501");
    }

    const tokenInsert = await owner.client
      .from("company_shopify_connections")
      .insert({ ...connectionRow(companyId, "lock-co-2.myshopify.com"), access_token: "hijacked" })
      .select();
    expect(tokenInsert.error?.code).toBe("42501");
  });

  it("denies a non-member from reading or connecting for another company", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Private Co");

    await owner.client
      .from("company_shopify_connections")
      .insert(connectionRow(companyId, "private-co.myshopify.com"));

    const read = await outsider.client
      .from("company_shopify_connections")
      .select("id")
      .eq("company_id", companyId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]); // RLS SELECT denial = empty set, not an error

    const insert = await outsider.client
      .from("company_shopify_connections")
      .insert(connectionRow(companyId, "private-co-2.myshopify.com"));
    expect(insert.error?.code).toBe("42501");
  });

  it("allows only one connection row per company", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify One Per Company Co");

    const first = await owner.client
      .from("company_shopify_connections")
      .insert(connectionRow(companyId, "one-a.myshopify.com"));
    expect(first.error).toBeNull();

    const second = await owner.client
      .from("company_shopify_connections")
      .insert(connectionRow(companyId, "one-b.myshopify.com"));
    expect(second.error?.code).toBe("23505");
  });

  it("refuses to attach one store to two different companies", async () => {
    const first = await signUpTestUser("first");
    const second = await signUpTestUser("second");
    const firstCompany = await createCompany(first.cookieHeader, "Shopify Claim Co A");
    const secondCompany = await createCompany(second.cookieHeader, "Shopify Claim Co B");

    const claimed = await first.client
      .from("company_shopify_connections")
      .insert(connectionRow(firstCompany, "contested.myshopify.com"));
    expect(claimed.error).toBeNull();

    const contested = await second.client
      .from("company_shopify_connections")
      .insert(connectionRow(secondCompany, "contested.myshopify.com"));
    expect(contested.error?.code).toBe("23505");

    // Once the first company disconnects, the store frees up (partial index
    // excludes 'disconnected').
    const released = await first.client
      .from("company_shopify_connections")
      .update({ status: "disconnected" })
      .eq("company_id", firstCompany);
    expect(released.error).toBeNull();

    const reclaimed = await second.client
      .from("company_shopify_connections")
      .insert(connectionRow(secondCompany, "contested.myshopify.com"));
    expect(reclaimed.error).toBeNull();
  });
});
