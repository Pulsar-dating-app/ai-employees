import { createHmac, timingSafeEqual } from "node:crypto";

// Validates Twilio's X-Twilio-Signature (https://www.twilio.com/docs/usage/security):
// HMAC-SHA1, keyed with the Auth Token of the (sub)account that sent the
// webhook, over the full request URL followed by every POST parameter as
// name+value, sorted by name, base64-encoded. Verifying this BEFORE trusting
// the body is what stops anyone who finds the webhook URL from injecting fake
// "customer" messages that the real Agent Engine would answer.
//
// `url` must be exactly the URL that was registered with Twilio -- callers
// rebuild it from STAFFRA_CHECKOUT_BASE_URL rather than from the incoming
// request, because behind a proxy the request's own host/protocol can differ.
export function computeTwilioSignature(url: string, params: [string, string][], authToken: string): string {
  const sorted = [...params].sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  const data = sorted.reduce((acc, [key, value]) => acc + key + value, url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function validateTwilioSignature(
  url: string,
  params: [string, string][],
  signatureHeader: string | null,
  authToken: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = Buffer.from(computeTwilioSignature(url, params, authToken));
  const provided = Buffer.from(signatureHeader);
  // timingSafeEqual throws on length mismatch -- a malformed header must not
  // throw out of a webhook handler.
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
