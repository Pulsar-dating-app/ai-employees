import { createHmac, timingSafeEqual } from "node:crypto";

// Shopify signs two very different things with the app's API secret, and
// they need two different verifiers:
//
//  * the OAuth callback redirect -- an `hmac` QUERY PARAM that is the
//    hex-encoded HMAC-SHA256 of the sorted remaining query string.
//  * every webhook POST -- an `X-Shopify-Hmac-SHA256` HEADER that is the
//    base64-encoded HMAC-SHA256 of the raw request body.
//
// Both must be checked BEFORE trusting anything else in the request (see
// src/lib/instagram/webhook-signature.ts for the same reasoning). timingSafeEqual
// throws on a length mismatch rather than returning false, so every path
// length-guards first -- a malformed signature must not throw out of a
// route handler.

function appSecret(): string {
  return process.env.SHOPIFY_API_SECRET!;
}

function safeEqualHex(expectedHex: string, providedHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const provided = Buffer.from(providedHex, "hex");
  if (expected.length === 0 || expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

function safeEqualBase64(expectedB64: string, providedB64: string): boolean {
  const expected = Buffer.from(expectedB64, "base64");
  const provided = Buffer.from(providedB64, "base64");
  if (expected.length === 0 || expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

// OAuth callback: https://shopify.dev/docs/apps/auth/get-access-tokens/authorization-code-grant#step-4-confirm-installation
// Everything except `hmac` (and the legacy `signature`, if present) is
// sorted by key and joined as `k=value` with `&`, then HMAC-SHA256'd with
// the app secret and hex-compared to the `hmac` param.
export function verifyOAuthCallbackHmac(searchParams: URLSearchParams): boolean {
  const provided = searchParams.get("hmac");
  if (!provided) return false;

  const pairs: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const message = pairs.join("&");

  const expected = createHmac("sha256", appSecret()).update(message).digest("hex");
  return safeEqualHex(expected, provided);
}

// Webhook POST: the digest is base64, over the exact raw body bytes.
export function verifyWebhookHmac(rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", appSecret()).update(rawBody, "utf8").digest("base64");
  return safeEqualBase64(expected, header);
}
