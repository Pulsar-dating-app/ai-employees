import { randomBytes } from "node:crypto";

// Trello N3 -- the `state` param that rides along Business Login for
// Instagram's redirect. Two jobs, deliberately kept separate:
//
// 1. Say which (company, agent) the merchant was connecting -- necessary
//    because the redirect URI is one shared URL (instagramCallbackUrl())
//    for every agent, not one per agent slug (see meta-instagram-api.ts).
//    companyId/agentSlug aren't secret, so they're plain JSON in `state`,
//    which Instagram echoes back on the query string for anyone to read.
// 2. Carry a nonce the callback route checks against an httpOnly cookie set
//    at the same time -- standard OAuth CSRF protection: a `state` value an
//    attacker can't have seen (it never left this server unencrypted to
//    anywhere but the merchant's own browser) proves the person completing
//    the flow is the same one who started it.

export interface OAuthState {
  companyId: string;
  agentSlug: string;
  nonce: string;
}

export const OAUTH_STATE_COOKIE = "ig_oauth_nonce";

export function generateNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function encodeState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

// Returns null on anything malformed rather than throwing -- the caller
// (the callback route) treats a bad state exactly like a missing one: fail
// the connect attempt, don't guess at where to redirect.
export function decodeState(raw: string): OAuthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    if (
      typeof parsed?.companyId === "string" &&
      typeof parsed?.agentSlug === "string" &&
      typeof parsed?.nonce === "string"
    ) {
      return parsed as OAuthState;
    }
    return null;
  } catch {
    return null;
  }
}
