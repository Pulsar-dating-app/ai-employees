import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { signedShopifyCallbackQuery } from "./helpers/shopify";

// company_shopify_connections.access_token/refresh_token are column-locked
// (migration 20260908100200), and (2026-09-22) insert/update/delete are
// locked to the service role entirely -- every real write goes through the
// connect/disconnect routes' service-role client, so the row here is created
// through the real connect endpoint, then probed directly via supabase-js.
// Same style as company-whatsapp-connections-rls.test.ts and
// company-calendar-connections-rls.test.ts.
//
// The unique-index business rules this file used to prove via raw inserts
// (one store per company, one store claimed platform-wide, freed on
// disconnect) predate the real connect route and are now exercised
// end-to-end through it instead -- shopify-connection.test.ts's "refuses to
// connect a store already held by another company" covers the same
// underlying constraint via the only path that can reach it in production.
describe("company_shopify_connections RLS: token columns are column-locked, writes are service-role-only", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  function uniqueShop(prefix: string) {
    return `${prefix}-${randomUUID().slice(0, 8)}.myshopify.com`;
  }

  function connectBody(shop: string, code: string) {
    const query = signedShopifyCallbackQuery({
      shop,
      code,
      timestamp: String(Math.floor(Date.now() / 1000)),
      state: "irrelevant-here",
    });
    return { query };
  }

  it("blocks even the company owner from selecting, inserting, or updating access_token / refresh_token directly", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Connections RLS Co");

    const connected = await api(
      "POST",
      `/api/companies/${companyId}/shopify/connect`,
      owner.cookieHeader,
      connectBody(uniqueShop("rls-lock"), "good-code"),
    );
    expect(connected.status).toBe(200);

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
      .insert({ company_id: companyId, shop_domain: uniqueShop("rls-lock-2"), access_token: "hijacked" })
      .select();
    expect(tokenInsert.error?.code).toBe("42501");
  });

  // 2026-09-22 -- proves the direct-RLS bypass is closed on safe columns
  // too, not just the token columns (see decisions.md).
  it("blocks a direct insert/update on safe columns too, not just the token columns", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Direct Write Bypass Co");

    const fakeInsert = await owner.client
      .from("company_shopify_connections")
      .insert({ company_id: companyId, shop_domain: uniqueShop("fake-bypass"), status: "connected" })
      .select();
    expect(fakeInsert.error?.code).toBe("42501");

    const fakeUpdate = await owner.client
      .from("company_shopify_connections")
      .update({ status: "connected" })
      .eq("company_id", companyId)
      .select();
    expect(fakeUpdate.error?.code).toBe("42501");
  });

  it("denies a non-member from reading another company's connection", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Private Co");
    await api(
      "POST",
      `/api/companies/${companyId}/shopify/connect`,
      owner.cookieHeader,
      connectBody(uniqueShop("rls-private"), "good-code"),
    );

    const read = await outsider.client
      .from("company_shopify_connections")
      .select("id")
      .eq("company_id", companyId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]); // RLS SELECT denial = empty set, not an error
  });
});
