import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestEnv } from "./helpers/env";
import { getTestServiceClient } from "./helpers/service-client";
import { shopifyWebhookHmac } from "./helpers/shopify";

// Verifies the mandatory Shopify webhook endpoint: base64 HMAC over the raw
// body (signed with the exact SHOPIFY_API_SECRET global-setup passed the
// spawned server, so the real verifier runs), plus the app/uninstalled and
// shop/redact teardown. Same shape as instagram-webhook.test.ts.
describe("Shopify webhook (POST /api/webhooks/shopify)", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function seedConnection(companyId: string, shop: string) {
    const { error } = await getTestServiceClient().from("company_shopify_connections").insert({
      company_id: companyId,
      shop_domain: shop,
      status: "connected",
      access_token: "seeded-token",
    });
    if (error) throw error;
  }

  async function readConnection(companyId: string) {
    const { data } = await getTestServiceClient()
      .from("company_shopify_connections")
      .select("status, access_token")
      .eq("company_id", companyId)
      .single();
    return data;
  }

  function postWebhook(rawBody: string, headers: Record<string, string>) {
    const { baseUrl } = getTestEnv();
    return fetch(`${baseUrl}/api/webhooks/shopify`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: rawBody,
    });
  }

  it("rejects a request with no signature header", async () => {
    const res = await postWebhook(JSON.stringify({ hello: "world" }), { "x-shopify-topic": "app/uninstalled" });
    expect(res.status).toBe(401);
  });

  it("rejects a signature from the wrong secret", async () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const wrong = createHmac("sha256", "not-the-real-secret").update(rawBody).digest("base64");
    const res = await postWebhook(rawBody, {
      "x-shopify-topic": "app/uninstalled",
      "x-shopify-hmac-sha256": wrong,
    });
    expect(res.status).toBe(401);
  });

  it("acknowledges a compliance webhook without changing state", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Compliance Co");
    const shop = "compliance-co.myshopify.com";
    await seedConnection(companyId, shop);

    const rawBody = JSON.stringify({ shop_domain: shop, customer: { id: 1 } });
    const res = await postWebhook(rawBody, {
      "x-shopify-topic": "customers/redact",
      "x-shopify-shop-domain": shop,
      "x-shopify-hmac-sha256": shopifyWebhookHmac(rawBody),
    });
    expect(res.status).toBe(200);
    expect((await readConnection(companyId))?.status).toBe("connected");
  });

  it("tears down the connection on app/uninstalled", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Shopify Uninstall Co");
    const shop = "uninstall-co.myshopify.com";
    await seedConnection(companyId, shop);

    const rawBody = JSON.stringify({ id: 999, name: shop });
    const res = await postWebhook(rawBody, {
      "x-shopify-topic": "app/uninstalled",
      "x-shopify-shop-domain": shop,
      "x-shopify-hmac-sha256": shopifyWebhookHmac(rawBody),
    });
    expect(res.status).toBe(200);

    const conn = await readConnection(companyId);
    expect(conn?.status).toBe("disconnected");
    expect(conn?.access_token).toBeNull();
  });
});
