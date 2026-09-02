import { createHmac, timingSafeEqual } from "node:crypto";

// Trello N4 -- every Meta webhook (WhatsApp, Instagram, Messenger alike)
// signs its POST body with the app secret. Verifying this BEFORE parsing
// the payload is what stops anyone who finds the URL from injecting fake
// "customer" messages that get answered by the real Agent Engine.
export function verifyInstagramSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  const igSecret = process.env.INSTAGRAM_APP_SECRET;
  const hasHeader = signatureHeader?.startsWith("sha256=") ?? false;
  const provided = hasHeader ? signatureHeader!.slice("sha256=".length) : "";
  const hmac = (s: string | undefined) =>
    s ? createHmac("sha256", s).update(rawBody).digest("hex") : "";
  const expected = hmac(secret);
  const expectedIg = hmac(igSecret);

  // TEMP DIAGNOSTIC (debug/ig-webhook-sig) -- no secret values, just shapes.
  console.error(
    "[ig-sig]",
    JSON.stringify({
      metaSecretSet: Boolean(secret),
      metaSecretLen: secret?.length ?? 0,
      igSecretSet: Boolean(igSecret),
      igSecretLen: igSecret?.length ?? 0,
      hasHeader,
      bodyLen: rawBody.length,
      bodyHead: rawBody.slice(0, 40),
      providedHead: provided.slice(0, 12),
      metaHmacHead: expected.slice(0, 12),
      igHmacHead: expectedIg.slice(0, 12),
      matchesMeta: hasHeader && Boolean(secret) && expected === provided,
      matchesInstagram: hasHeader && Boolean(igSecret) && expectedIg === provided,
    }),
  );

  if (!hasHeader || !secret) return false;

  // timingSafeEqual throws on length mismatch rather than returning false --
  // a malformed/short header must not throw out of a webhook handler.
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
