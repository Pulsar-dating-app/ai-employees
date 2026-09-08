import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { setMockCatalogue } from "./helpers/shopify";

// Exercises src/lib/shopify/catalog-sync.ts end to end through POST
// /shopify/sync: map Shopify products -> `products` rows, upsert by
// (company_id, external_id), deactivate anything a later run no longer
// sees. The Shopify Admin API is the mock; the products table, the partial
// unique index, and the sync itself are the real local Supabase stack.
// (Embeddings are disabled suite-wide, so synced rows persist embedding: null.)
describe("Shopify catalogue sync (POST /shopify/sync)", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  // Seeds a `connected` row directly (access_token is column-locked, so this
  // has to go through the service client). Shop domain + token are unique
  // per call so the suite is rerun-safe (the platform-wide shop_domain
  // index would otherwise collide across runs) and the mock keys its
  // catalogue off the token. `tokenHint` lets a test force a mock path
  // (a token containing "graphql-failure"); `opts` controls token freshness
  // -- by default the access token is well within its lifetime so the sync
  // uses it directly without a refresh.
  async function seedConnection(
    companyId: string,
    tokenHint = "ok",
    opts: { expiresAt?: string | null; refreshToken?: string | null } = {},
  ) {
    const unique = randomUUID().slice(0, 8);
    const shop = `sync-${unique}.myshopify.com`;
    const token = `${tokenHint}-token-${unique}`;
    const { error } = await getTestServiceClient()
      .from("company_shopify_connections")
      .insert({
        company_id: companyId,
        shop_domain: shop,
        status: "connected",
        access_token: token,
        refresh_token: opts.refreshToken === undefined ? `refresh-${unique}` : opts.refreshToken,
        token_expires_at:
          opts.expiresAt === undefined
            ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
            : opts.expiresAt,
        currency: "BRL",
      });
    if (error) throw error;
    return { shop, token, unique };
  }

  async function syncedProducts(companyId: string) {
    const { data, error } = await getTestServiceClient()
      .from("products")
      .select("external_id, name, price, currency, is_active, metadata")
      .eq("company_id", companyId)
      .like("external_id", "shopify:%")
      .order("external_id", { ascending: true });
    if (error) throw error;
    return data as {
      external_id: string;
      name: string;
      price: string | null;
      currency: string | null;
      is_active: boolean;
      metadata: { source?: string } | null;
    }[];
  }

  it("returns 409 when the company has no connected store", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Sync Unconnected Co");

    const result = await api<{ error: string }>("POST", `/api/companies/${companyId}/shopify/sync`, owner.cookieHeader);
    expect(result.status).toBe(409);
    expect(result.json.error).toBe("not_connected");
  });

  it("returns 502 when the Shopify round trip fails", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Sync Failure Co");
    await seedConnection(companyId, "graphql-failure");

    const result = await api("POST", `/api/companies/${companyId}/shopify/sync`, owner.cookieHeader);
    expect(result.status).toBe(502);
  });

  it("imports the catalogue, skips unmappable rows, and re-syncs in place", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Sync Co");
    const { token } = await seedConnection(companyId);

    // --- first sync -------------------------------------------------------
    await setMockCatalogue(token, [
      { id: 1, title: "Camiseta Azul", price: "50.00", status: "ACTIVE", productType: "Roupas" },
      { id: 2, title: "Boné Preto", price: "30.00", status: "ACTIVE" },
      { id: 3, title: "Meia Branca", price: "15.00", status: "ACTIVE" },
      { id: 4, title: "Preço Inválido", price: "-5", status: "ACTIVE" },
    ]);

    const first = await api<{ synced: number; deactivated: number; skipped: { title: string }[] }>(
      "POST",
      `/api/companies/${companyId}/shopify/sync`,
      owner.cookieHeader,
    );
    expect(first.status).toBe(200);
    expect(first.json.synced).toBe(3);
    expect(first.json.deactivated).toBe(0);
    expect(first.json.skipped).toEqual([{ title: "Preço Inválido", reason: "price must be a number >= 0" }]);

    let rows = await syncedProducts(companyId);
    expect(rows.map((r) => r.external_id)).toEqual(["shopify:1", "shopify:2", "shopify:3"]);
    const camiseta = rows.find((r) => r.external_id === "shopify:1")!;
    expect(camiseta.name).toBe("Camiseta Azul");
    expect(Number(camiseta.price)).toBe(50);
    expect(camiseta.currency).toBe("BRL");
    expect(camiseta.is_active).toBe(true);
    expect(camiseta.metadata?.source).toBe("shopify");

    // --- second sync: rename #1, drop #3 and #4 -------------------------
    await setMockCatalogue(token, [
      { id: 1, title: "Camiseta Azul Escuro", price: "50.00", status: "ACTIVE", productType: "Roupas" },
      { id: 2, title: "Boné Preto", price: "30.00", status: "ACTIVE" },
    ]);

    const second = await api<{ synced: number; deactivated: number; skipped: unknown[] }>(
      "POST",
      `/api/companies/${companyId}/shopify/sync`,
      owner.cookieHeader,
    );
    expect(second.status).toBe(200);
    expect(second.json.synced).toBe(2);
    expect(second.json.deactivated).toBe(1); // shopify:3 no longer in the catalogue
    expect(second.json.skipped).toEqual([]);

    rows = await syncedProducts(companyId);
    // Still exactly three rows -- the re-sync updated in place, no duplicates
    // (proves the (company_id, external_id) unique index + onConflict).
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.external_id === "shopify:1")!.name).toBe("Camiseta Azul Escuro");
    expect(rows.find((r) => r.external_id === "shopify:2")!.is_active).toBe(true);
    expect(rows.find((r) => r.external_id === "shopify:3")!.is_active).toBe(false);

    // last_synced_at was stamped on the connection.
    const conn = await getTestServiceClient()
      .from("company_shopify_connections")
      .select("last_synced_at")
      .eq("company_id", companyId)
      .single();
    expect(conn.data?.last_synced_at).not.toBeNull();
  });

  it("marks DRAFT / ARCHIVED products inactive", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Sync Draft Co");
    const { token } = await seedConnection(companyId);

    await setMockCatalogue(token, [
      { id: 10, title: "Publicado", price: "20.00", status: "ACTIVE" },
      { id: 11, title: "Rascunho", price: "20.00", status: "DRAFT" },
    ]);

    const result = await api<{ synced: number }>("POST", `/api/companies/${companyId}/shopify/sync`, owner.cookieHeader);
    expect(result.status).toBe(200);
    expect(result.json.synced).toBe(2);

    const rows = await syncedProducts(companyId);
    expect(rows.find((r) => r.external_id === "shopify:10")!.is_active).toBe(true);
    expect(rows.find((r) => r.external_id === "shopify:11")!.is_active).toBe(false);
  });

  it("refreshes an expired access token before syncing and persists the rotated tokens", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Sync Refresh Co");
    // Access token already expired; a usable refresh token is on file.
    const { token, unique } = await seedConnection(companyId, "ok", {
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      refreshToken: `refresh-live-${randomUUID().slice(0, 8)}`,
    });
    // The mock keys its catalogue off the token the request actually uses --
    // after a refresh that's `shopify-token-refreshed-<oldRefreshToken>`.
    // Register the catalogue under BOTH so whichever token is used finds it.
    const products = [{ id: 1, title: `Item ${unique}`, price: "10.00", status: "ACTIVE" as const }];
    await setMockCatalogue(token, products);

    const connBefore = await getTestServiceClient()
      .from("company_shopify_connections")
      .select("refresh_token")
      .eq("company_id", companyId)
      .single();
    await setMockCatalogue(`shopify-token-refreshed-${connBefore.data?.refresh_token}`, products);

    const result = await api<{ synced: number }>(
      "POST",
      `/api/companies/${companyId}/shopify/sync`,
      owner.cookieHeader,
    );
    expect(result.status).toBe(200);
    expect(result.json.synced).toBe(1);

    // The connection now holds the refreshed access token, the rotated
    // refresh token, and a fresh future expiry.
    const conn = await getTestServiceClient()
      .from("company_shopify_connections")
      .select("access_token, refresh_token, token_expires_at")
      .eq("company_id", companyId)
      .single();
    expect(conn.data?.access_token).toMatch(/^shopify-token-refreshed-/);
    expect(conn.data?.refresh_token).toMatch(/^shopify-refresh-rotated-/);
    expect(Date.parse(conn.data?.token_expires_at as string)).toBeGreaterThan(Date.now());
  });

  it("returns 409 reauth_required when the refresh token is terminal", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Sync Reauth Co");
    await seedConnection(companyId, "ok", {
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      refreshToken: "refresh-expired-token",
    });

    const result = await api<{ error: string }>(
      "POST",
      `/api/companies/${companyId}/shopify/sync`,
      owner.cookieHeader,
    );
    expect(result.status).toBe(409);
    expect(result.json.error).toBe("reauth_required");
  });
});
