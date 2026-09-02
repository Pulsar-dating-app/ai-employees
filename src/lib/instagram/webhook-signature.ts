import { createHmac, timingSafeEqual } from "node:crypto";

// Trello N4 -- Meta signs every inbound webhook's POST body; verifying it
// BEFORE parsing the payload is what stops anyone who finds the URL from
// injecting fake "customer" messages that get answered by the real Agent
// Engine.
//
// **The signing key is INSTAGRAM_APP_SECRET, not META_APP_SECRET.**
// "Instagram API with Instagram Login" (the Business Login product this app
// uses -- api.instagram.com / graph.instagram.com) is issued its own
// App ID + Secret and signs its webhooks with that Instagram App Secret,
// *not* the top-level Meta app secret. (This was wrong in the original N4
// code -- found in production 2026-09-02 as a permanent signature-mismatch
// 403 on every real delivery; a diagnostic HMAC over the raw body with
// each secret showed INSTAGRAM_APP_SECRET was the match. The classic
// Graph API / Messenger / WhatsApp webhooks *do* use META_APP_SECRET, so
// meta-graph-api.ts's dormant WhatsApp path is unaffected.)
export function verifyInstagramSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", process.env.INSTAGRAM_APP_SECRET!).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  // timingSafeEqual throws on length mismatch rather than returning false --
  // a malformed/short header must not throw out of a webhook handler.
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
