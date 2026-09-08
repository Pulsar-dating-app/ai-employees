import { createHmac } from "node:crypto";
import { getTestEnv } from "./env";
import type { MockProductInput } from "./shopify-api-mock";

// Must match SHOPIFY_API_SECRET in global-setup.ts -- the connection tests
// sign their OAuth-callback query and webhook bodies with this exact value
// so the real verifiers in src/lib/shopify/hmac.ts run, not a bypass.
export const SHOPIFY_TEST_SECRET = "test-shopify-api-secret";

// Builds the query string Shopify would redirect back with, including a
// valid `hmac` over the sorted `k=v` params (the algorithm
// verifyOAuthCallbackHmac checks). Pass `hmac: "..."` in params to force a
// bad signature.
export function signedShopifyCallbackQuery(params: Record<string, string>): string {
  const forcedHmac = params.hmac;
  const rest = { ...params };
  delete rest.hmac;

  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");
  const hmac = forcedHmac ?? createHmac("sha256", SHOPIFY_TEST_SECRET).update(message).digest("hex");

  const sp = new URLSearchParams(rest);
  sp.set("hmac", hmac);
  return sp.toString();
}

// Base64 X-Shopify-Hmac-SHA256 header value for a raw webhook body.
export function shopifyWebhookHmac(rawBody: string): string {
  return createHmac("sha256", SHOPIFY_TEST_SECRET).update(rawBody, "utf8").digest("base64");
}

export async function setMockCatalogue(token: string, products: MockProductInput[]): Promise<void> {
  const { shopifyApiMockUrl } = getTestEnv();
  const res = await fetch(`${shopifyApiMockUrl}/__products`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, products }),
  });
  if (!res.ok) throw new Error(`setMockCatalogue failed: ${res.status}`);
}

export async function clearMockCatalogues(): Promise<void> {
  const { shopifyApiMockUrl } = getTestEnv();
  await fetch(`${shopifyApiMockUrl}/__products`, { method: "DELETE" });
}

// Flips a "bulk-slow" token's bulk export from RUNNING to COMPLETED so the
// next sync resumes it.
export async function completeMockBulk(token: string): Promise<void> {
  const { shopifyApiMockUrl } = getTestEnv();
  const res = await fetch(`${shopifyApiMockUrl}/__bulk-complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(`completeMockBulk failed: ${res.status}`);
}
