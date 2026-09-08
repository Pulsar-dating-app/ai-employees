import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { signedShopifyCallbackQuery } from "./helpers/shopify";

// Shopify's real per-shop Admin API + OAuth endpoints are stood in for by
// tests/integration/helpers/shopify-api-mock.ts (wired via
// SHOPIFY_ADMIN_API_BASE_URL). Everything else -- auth, RLS, the actual
// Postgres rows -- goes through the real local Supabase stack. Structural
// sibling of calendar-connection.test.ts, adapted for Shopify's HMAC'd
// callback (the connect route takes { query } echoed from the callback,
// not a plain { code }).
describe("Shopify connection (GET/DELETE /shopify, POST /shopify/connect)", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function addMember(ownerCookie: string, companyId: string, userId: string) {
    await api("POST", `/api/companies/${companyId}/members`, ownerCookie, { userId, role: "member" });
  }

  // Unique per call so the suite is rerun-safe -- the platform-wide
  // shop_domain uniqueness would otherwise make a rerun's connect see the
  // previous run's row and 409.
  function uniqueShop(prefix: string) {
    return `${prefix}-${randomUUID().slice(0, 8)}.myshopify.com`;
  }

  function connectBody(shop: string, code: string, overrides: Record<string, string> = {}) {
    const query = signedShopifyCallbackQuery({
      shop,
      code,
      timestamp: String(Math.floor(Date.now() / 1000)),
      state: "irrelevant-here",
      ...overrides,
    });
    return { query };
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Auth Co");

    expect((await api("GET", `/api/companies/${companyId}/shopify`)).status).toBe(401);
    expect((await api("DELETE", `/api/companies/${companyId}/shopify`)).status).toBe(401);
    expect(
      (await api("POST", `/api/companies/${companyId}/shopify/connect`, undefined, connectBody("s.myshopify.com", "c")))
        .status,
    ).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Members Co");

    expect((await api("GET", `/api/companies/${companyId}/shopify`, outsider.cookieHeader)).status).toBe(403);
    expect((await api("DELETE", `/api/companies/${companyId}/shopify`, outsider.cookieHeader)).status).toBe(403);
    expect(
      (
        await api(
          "POST",
          `/api/companies/${companyId}/shopify/connect`,
          outsider.cookieHeader,
          connectBody("s.myshopify.com", "c"),
        )
      ).status,
    ).toBe(403);
  });

  it("lets a plain member view status but not connect or disconnect", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Read Only Co");
    await addMember(owner.cookieHeader, companyId, member.userId);

    expect((await api("GET", `/api/companies/${companyId}/shopify`, member.cookieHeader)).status).toBe(200);
    expect(
      (
        await api(
          "POST",
          `/api/companies/${companyId}/shopify/connect`,
          member.cookieHeader,
          connectBody("read-only.myshopify.com", "good-code"),
        )
      ).status,
    ).toBe(403);
    expect((await api("DELETE", `/api/companies/${companyId}/shopify`, member.cookieHeader)).status).toBe(403);
  });

  it("rejects a callback whose HMAC doesn't verify", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Bad HMAC Co");

    const badHmac = await api(
      "POST",
      `/api/companies/${companyId}/shopify/connect`,
      owner.cookieHeader,
      connectBody("bad-hmac.myshopify.com", "good-code", { hmac: "deadbeef" }),
    );
    expect(badHmac.status).toBe(401);
    expect((badHmac.json as { error: string }).error).toBe("invalid_hmac");
  });

  it("rejects a verified callback that is missing the code", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify No Code Co");

    const query = signedShopifyCallbackQuery({
      shop: "no-code.myshopify.com",
      timestamp: String(Math.floor(Date.now() / 1000)),
    });
    const result = await api("POST", `/api/companies/${companyId}/shopify/connect`, owner.cookieHeader, { query });
    expect(result.status).toBe(400);
  });

  it("connects, never returns the token, and is idempotent on reconnect", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Connect Co");
    const shop = uniqueShop("connect-co");

    const before = await api<{ connection: unknown }>("GET", `/api/companies/${companyId}/shopify`, owner.cookieHeader);
    expect(before.json.connection).toBeNull();

    const connected = await api<{
      connection: {
        shop_domain: string;
        shop_name: string;
        currency: string;
        scope: string;
        status: string;
        connected_at: string;
        token_expires_at: string;
        access_token?: string;
        refresh_token?: string;
      };
    }>("POST", `/api/companies/${companyId}/shopify/connect`, owner.cookieHeader, connectBody(shop, "good-code"));

    expect(connected.status).toBe(200);
    expect(connected.json.connection.status).toBe("connected");
    expect(connected.json.connection.shop_domain).toBe(shop);
    expect(connected.json.connection.currency).toBe("BRL");
    expect(connected.json.connection.scope).toBe("read_products");
    // Expiring offline token: an expiry is recorded; neither token leaks.
    expect(Date.parse(connected.json.connection.token_expires_at)).toBeGreaterThan(Date.now());
    expect(connected.json.connection.access_token).toBeUndefined();
    expect(connected.json.connection.refresh_token).toBeUndefined();

    const reconnected = await api<{ connection: { status: string } }>(
      "POST",
      `/api/companies/${companyId}/shopify/connect`,
      owner.cookieHeader,
      connectBody(shop, "good-code-2"),
    );
    expect(reconnected.status).toBe(200); // upsert on company_id, not a 409/500

    // The tokens are column-locked -- verify via the service client that
    // both the access token and its rotating refresh token landed.
    const row = await getTestServiceClient()
      .from("company_shopify_connections")
      .select("access_token, refresh_token")
      .eq("company_id", companyId)
      .single();
    expect(row.data?.access_token).toBe("shopify-token-good-code-2");
    expect(row.data?.refresh_token).toBe("shopify-refresh-good-code-2");
  });

  it("returns 502 (not a raw Shopify error) when the token exchange fails", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Token Fail Co");

    const result = await api(
      "POST",
      `/api/companies/${companyId}/shopify/connect`,
      owner.cookieHeader,
      connectBody("token-fail.myshopify.com", "trigger-token-failure"),
    );
    expect(result.status).toBe(502);
  });

  it("refuses to connect a store already held by another company", async () => {
    const first = await signUpTestUser("first");
    const second = await signUpTestUser("second");
    const firstCompany = await createCompany(first.cookieHeader, "Shopify Claim Co A");
    const secondCompany = await createCompany(second.cookieHeader, "Shopify Claim Co B");
    const shop = uniqueShop("contested-store");

    const claimed = await api(
      "POST",
      `/api/companies/${firstCompany}/shopify/connect`,
      first.cookieHeader,
      connectBody(shop, "good-code"),
    );
    expect(claimed.status).toBe(200);

    const contested = await api<{ error: string }>(
      "POST",
      `/api/companies/${secondCompany}/shopify/connect`,
      second.cookieHeader,
      connectBody(shop, "good-code"),
    );
    expect(contested.status).toBe(409);
    expect(contested.json.error).toBe("shop_connected_elsewhere");
  });

  it("disconnects: flips status, clears the token, and is a no-op when nothing was connected", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Disconnect Co");

    const noop = await api<{ connection: unknown }>("DELETE", `/api/companies/${companyId}/shopify`, owner.cookieHeader);
    expect(noop.status).toBe(200);
    expect(noop.json.connection).toBeNull();

    await api(
      "POST",
      `/api/companies/${companyId}/shopify/connect`,
      owner.cookieHeader,
      connectBody(uniqueShop("disconnect-co"), "good-code"),
    );

    const disconnected = await api<{ connection: { status: string } }>(
      "DELETE",
      `/api/companies/${companyId}/shopify`,
      owner.cookieHeader,
    );
    expect(disconnected.status).toBe(200);
    expect(disconnected.json.connection.status).toBe("disconnected");

    const row = await getTestServiceClient()
      .from("company_shopify_connections")
      .select("access_token, refresh_token, token_expires_at")
      .eq("company_id", companyId)
      .single();
    expect(row.data?.access_token).toBeNull();
    expect(row.data?.refresh_token).toBeNull();
    expect(row.data?.token_expires_at).toBeNull();
  });
});
