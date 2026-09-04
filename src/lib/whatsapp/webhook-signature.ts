import { createHmac, timingSafeEqual } from "node:crypto";

// Trello D2 -- Meta signs every inbound webhook's POST body; verifying it
// BEFORE parsing the payload is what stops anyone who finds the URL from
// injecting fake "customer" messages that get answered by the real Agent
// Engine.
//
// Signed with META_APP_SECRET, not a WhatsApp-specific secret: WhatsApp
// Cloud API is a classic Graph API product (unlike Instagram's separate
// Business Login credentials -- see decisions.md's 2026-09-01 entry, found
// live when Instagram's webhook used the wrong secret and every real
// delivery 403'd). D1's meta-graph-api.ts already uses META_APP_ID/
// META_APP_SECRET for the connect flow; this is the same credential pair.
export function verifyWhatsappSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", process.env.META_APP_SECRET!).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  // timingSafeEqual throws on length mismatch rather than returning false --
  // a malformed/short header must not throw out of a webhook handler.
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
