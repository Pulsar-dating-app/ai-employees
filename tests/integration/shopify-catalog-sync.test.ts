import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { completeMockBulk, setMockCatalogue } from "./helpers/shopify";

// Exercises src/lib/shopify/catalog-sync.ts end to end through POST
// /shopify/sync. Two modes:
//  - FULL (no last_synced_at, or ?full=true, or resuming a bulk op): the
//    GraphQL Bulk Operations path; deactivates rows the export didn't hold.
//  - DELTA (a watermark exists): `updated_at:>` paginated query; upsert only.
// The Shopify Admin API is the mock; the products table and the sync are
// the real local Supabase stack. (Embeddings are disabled suite-wide, so
// synced rows persist embedding: null.)
describe("Shopify catalogue sync (POST /shopify/sync)", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  // Seeds a `connected` row directly (tokens are column-locked). Unique
  // shop domain + token per call so the suite is rerun-safe and the mock
  // keys its catalogue off the token. Defaults: fresh access token, no
  // watermark (so the first sync is FULL).
  async function seedConnection(
    companyId: string,
    tokenHint = "ok",
    opts: {
      expiresAt?: string | null;
      refreshToken?: string | null;
      lastSyncedAt?: string | null;
    } = {},
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
        last_synced_at: opts.lastSyncedAt ?? null,
        currency: "BRL",
      });
    if (error) throw error;
    return { shop, token, unique };
  }

  function sync(companyId: string, cookie: string, full = false) {
    return api<{
      mode: string;
      status: string;
      synced: number;
      deactivated: number;
      skipped: { title: string; reason: string }[];
    }>("POST", `/api/companies/${companyId}/shopify/sync`, cookie, { full });
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

    const result = await sync(companyId, owner.cookieHeader);
    expect(result.status).toBe(409);
    expect((result.json as unknown as { error: string }).error).toBe("not_connected");
  });

  it("returns 502 when the Shopify round trip fails", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Sync Failure Co");
    await seedConnection(companyId, "graphql-failure");

    const result = await sync(companyId, owner.cookieHeader);
    expect(result.status).toBe(502);
  });

  it("first sync runs a full bulk import, skipping unmappable rows", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Full Sync Co");
    const { token } = await seedConnection(companyId);

    await setMockCatalogue(token, [
      { id: 1, title: "Camiseta Azul", price: "50.00", status: "ACTIVE", productType: "Roupas" },
      { id: 2, title: "Boné Preto", price: "30.00", status: "ACTIVE" },
      { id: 3, title: "Rascunho", price: "10.00", status: "DRAFT" },
      { id: 4, title: "Preço Inválido", price: "-5", status: "ACTIVE" },
    ]);

    const res = await sync(companyId, owner.cookieHeader);
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("full");
    expect(res.json.status).toBe("completed");
    expect(res.json.synced).toBe(3);
    expect(res.json.skipped).toEqual([{ title: "Preço Inválido", reason: "price must be a number >= 0" }]);

    const rows = await syncedProducts(companyId);
    expect(rows.map((r) => r.external_id)).toEqual(["shopify:1", "shopify:2", "shopify:3"]);
    const camiseta = rows.find((r) => r.external_id === "shopify:1")!;
    expect(camiseta.name).toBe("Camiseta Azul");
    expect(Number(camiseta.price)).toBe(50);
    expect(camiseta.currency).toBe("BRL");
    expect(camiseta.metadata?.source).toBe("shopify");
    // DRAFT -> inactive.
    expect(rows.find((r) => r.external_id === "shopify:3")!.is_active).toBe(false);

    const conn = await getTestServiceClient()
      .from("company_shopify_connections")
      .select("last_synced_at, bulk_sync_op_id")
      .eq("company_id", companyId)
      .single();
    expect(conn.data?.last_synced_at).not.toBeNull();
    expect(conn.data?.bulk_sync_op_id).toBeNull();
  });

  it("subsequent syncs are deltas: only changed products, no deactivation", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Delta Co");
    // Watermark already set -> DELTA mode.
    const { token } = await seedConnection(companyId, "ok", {
      lastSyncedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    // #1 seeded as if a prior full sync had imported it.
    await getTestServiceClient()
      .from("products")
      .insert({
        company_id: companyId,
        external_id: "shopify:1",
        name: "Camiseta (antiga)",
        price: "50.00",
        currency: "BRL",
        is_active: true,
        metadata: { source: "shopify", sync_run: "old-run" },
      });

    await setMockCatalogue(token, [
      // changed recently -> in the delta
      { id: 1, title: "Camiseta Nova", price: "55.00", status: "ACTIVE", updatedAt: new Date().toISOString() },
      // untouched long ago -> NOT in the delta
      { id: 2, title: "Boné", price: "30.00", status: "ACTIVE", updatedAt: "2001-01-01T00:00:00Z" },
    ]);

    const res = await sync(companyId, owner.cookieHeader);
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("delta");
    expect(res.json.synced).toBe(1);
    expect(res.json.deactivated).toBe(0);

    const rows = await syncedProducts(companyId);
    // #1 updated in place; #2 never touched (delta didn't see it); #1 still
    // active (delta never deactivates).
    expect(rows.map((r) => r.external_id)).toEqual(["shopify:1"]);
    expect(rows[0].name).toBe("Camiseta Nova");
    expect(rows[0].is_active).toBe(true);
  });

  it("a full re-sync (?full=true) deactivates products removed from Shopify", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Full Resync Co");
    const { token } = await seedConnection(companyId);

    await setMockCatalogue(token, [
      { id: 1, title: "Fica", price: "10.00", status: "ACTIVE" },
      { id: 2, title: "Sai depois", price: "20.00", status: "ACTIVE" },
    ]);
    await sync(companyId, owner.cookieHeader); // first sync (full)

    // #2 removed from the store.
    await setMockCatalogue(token, [{ id: 1, title: "Fica", price: "10.00", status: "ACTIVE" }]);

    const res = await sync(companyId, owner.cookieHeader, true);
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("full");
    expect(res.json.deactivated).toBe(1);

    const rows = await syncedProducts(companyId);
    expect(rows.find((r) => r.external_id === "shopify:1")!.is_active).toBe(true);
    expect(rows.find((r) => r.external_id === "shopify:2")!.is_active).toBe(false);
  });

  it("hands back status:running for a slow bulk export and resumes it on the next sync", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Bulk Slow Co");
    const { token } = await seedConnection(companyId, "bulk-slow");
    await setMockCatalogue(token, [{ id: 7, title: "Produto", price: "12.00", status: "ACTIVE" }]);

    const running = await sync(companyId, owner.cookieHeader);
    expect(running.status).toBe(202);
    expect(running.json.status).toBe("running");
    expect(running.json.synced).toBe(0);

    const mid = await getTestServiceClient()
      .from("company_shopify_connections")
      .select("bulk_sync_op_id")
      .eq("company_id", companyId)
      .single();
    expect(mid.data?.bulk_sync_op_id).not.toBeNull();

    await completeMockBulk(token);

    const done = await sync(companyId, owner.cookieHeader);
    expect(done.status).toBe(200);
    expect(done.json.status).toBe("completed");
    expect(done.json.synced).toBe(1);

    const rows = await syncedProducts(companyId);
    expect(rows.map((r) => r.external_id)).toEqual(["shopify:7"]);

    const after = await getTestServiceClient()
      .from("company_shopify_connections")
      .select("bulk_sync_op_id, last_synced_at")
      .eq("company_id", companyId)
      .single();
    expect(after.data?.bulk_sync_op_id).toBeNull();
    expect(after.data?.last_synced_at).not.toBeNull();
  });

  it("refreshes an expired access token before syncing and persists the rotated tokens", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Sync Refresh Co");
    const { unique } = await seedConnection(companyId, "ok", {
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      refreshToken: `refresh-live-${randomUUID().slice(0, 8)}`,
    });

    // After the refresh the request uses `shopify-token-refreshed-<oldRT>` --
    // register the catalogue under that token.
    const connBefore = await getTestServiceClient()
      .from("company_shopify_connections")
      .select("refresh_token")
      .eq("company_id", companyId)
      .single();
    await setMockCatalogue(`shopify-token-refreshed-${connBefore.data?.refresh_token}`, [
      { id: 1, title: `Item ${unique}`, price: "10.00", status: "ACTIVE" },
    ]);

    const res = await sync(companyId, owner.cookieHeader);
    expect(res.status).toBe(200);
    expect(res.json.synced).toBe(1);

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

    const result = await sync(companyId, owner.cookieHeader);
    expect(result.status).toBe(409);
    expect((result.json as unknown as { error: string }).error).toBe("reauth_required");
  });
});
