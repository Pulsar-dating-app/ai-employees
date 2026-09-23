import { describe, expect, it } from "vitest";
import { computeTwilioSignature, validateTwilioSignature } from "@/lib/whatsapp/twilio/signature";

// The worked example from Twilio's own security docs
// (https://www.twilio.com/docs/usage/security): URL with a query string,
// five POST parameters, AuthToken "12345" -> "L/OH5YylLD5NRKLltdqwSvS0BnU=".
const URL_WITH_QUERY = "https://example.com/myapp.php?foo=1&bar=2";
const DOC_PARAMS: [string, string][] = [
  ["Digits", "1234"],
  ["To", "+18005551212"],
  ["From", "+14158675310"],
  ["Caller", "+14158675310"],
  ["CallSid", "CA1234567890ABCDE"],
];
const DOC_TOKEN = "12345";
const DOC_SIGNATURE = "L/OH5YylLD5NRKLltdqwSvS0BnU=";

describe("Twilio signature validation", () => {
  it("reproduces Twilio's documented example signature", () => {
    expect(computeTwilioSignature(URL_WITH_QUERY, DOC_PARAMS, DOC_TOKEN)).toBe(DOC_SIGNATURE);
  });

  it("does not depend on the order parameters arrive in", () => {
    const shuffled = [...DOC_PARAMS].reverse();
    expect(computeTwilioSignature(URL_WITH_QUERY, shuffled, DOC_TOKEN)).toBe(DOC_SIGNATURE);
  });

  it("accepts the right signature and rejects everything else", () => {
    expect(validateTwilioSignature(URL_WITH_QUERY, DOC_PARAMS, DOC_SIGNATURE, DOC_TOKEN)).toBe(true);
    // wrong token, tampered body, different URL, missing/garbage header
    expect(validateTwilioSignature(URL_WITH_QUERY, DOC_PARAMS, DOC_SIGNATURE, "other-token")).toBe(false);
    expect(
      validateTwilioSignature(URL_WITH_QUERY, [...DOC_PARAMS, ["Body", "injected"]], DOC_SIGNATURE, DOC_TOKEN),
    ).toBe(false);
    expect(validateTwilioSignature("https://evil.example/myapp.php?foo=1&bar=2", DOC_PARAMS, DOC_SIGNATURE, DOC_TOKEN)).toBe(false);
    expect(validateTwilioSignature(URL_WITH_QUERY, DOC_PARAMS, null, DOC_TOKEN)).toBe(false);
    expect(validateTwilioSignature(URL_WITH_QUERY, DOC_PARAMS, "short", DOC_TOKEN)).toBe(false);
  });
});
