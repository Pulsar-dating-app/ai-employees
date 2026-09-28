import { createHmac, timingSafeEqual } from "node:crypto";

export function computeTwilioSignature(url: string, params: URLSearchParams, authToken: string): string {
  const payload = [...new Set(params.keys())]
    .sort()
    .reduce((acc, key) => acc + params.getAll(key).map((value) => key + value).join(""), url);
  return createHmac("sha1", authToken).update(payload).digest("base64");
}

export function verifyTwilioSignature(
  url: string,
  params: URLSearchParams,
  signatureHeader: string | null,
  authToken: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = Buffer.from(computeTwilioSignature(url, params, authToken));
  const provided = Buffer.from(signatureHeader);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
