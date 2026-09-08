import { randomBytes } from "node:crypto";

// The `state` param that rides along Shopify's OAuth redirect. Two jobs,
// kept separate -- a direct copy of src/lib/instagram/oauth-state.ts:
//
// 1. Say which company (and which shop) the merchant was connecting --
//    necessary because the redirect URI is one shared URL
//    (shopifyCallbackUrl()) for every company, not one per company id.
//    companyId/shop aren't secret, so they ride as plain base64url JSON
//    that Shopify echoes back on the query string.
// 2. Carry a nonce the callback route checks against an httpOnly cookie set
//    at the same time -- standard OAuth CSRF protection.

export interface OAuthState {
  companyId: string;
  shop: string;
  nonce: string;
}

export const SHOPIFY_OAUTH_STATE_COOKIE = "shopify_oauth_nonce";

export function generateNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function encodeState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

// Returns null on anything malformed rather than throwing -- the callback
// route treats a bad state exactly like a missing one: fail the connect
// attempt, redirect to the products page with an error.
export function decodeState(raw: string): OAuthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    if (
      typeof parsed?.companyId === "string" &&
      typeof parsed?.shop === "string" &&
      typeof parsed?.nonce === "string"
    ) {
      return parsed as OAuthState;
    }
    return null;
  } catch {
    return null;
  }
}
