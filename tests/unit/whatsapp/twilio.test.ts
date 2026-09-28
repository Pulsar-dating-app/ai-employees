import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeTwilioSignature, verifyTwilioSignature } from "@/lib/whatsapp/twilio-signature";
import { toWhatsappSenderId } from "@/lib/whatsapp/twilio-api";

describe("computeTwilioSignature", () => {
  it("signs the URL followed by every param as key+value in key order", () => {
    const params = new URLSearchParams({ To: "+18005551212", Body: "oi", AccountSid: "AC1" });
    const expected = createHmac("sha1", "12345")
      .update("https://example.com/hookAccountSidAC1BodyoiTo+18005551212")
      .digest("base64");
    expect(computeTwilioSignature("https://example.com/hook", params, "12345")).toBe(expected);
  });
});

describe("verifyTwilioSignature", () => {
  const url = "https://app.example/api/webhooks/twilio/whatsapp";
  const params = new URLSearchParams({ Body: "oi", From: "whatsapp:+5511900000000" });

  it("accepts the signature computed with the same token", () => {
    expect(verifyTwilioSignature(url, params, computeTwilioSignature(url, params, "token"), "token")).toBe(true);
  });

  it("rejects a missing, malformed, or foreign-token signature", () => {
    expect(verifyTwilioSignature(url, params, null, "token")).toBe(false);
    expect(verifyTwilioSignature(url, params, "short", "token")).toBe(false);
    expect(verifyTwilioSignature(url, params, computeTwilioSignature(url, params, "other"), "token")).toBe(false);
  });

  it("rejects a tampered body", () => {
    const signature = computeTwilioSignature(url, params, "token");
    const tampered = new URLSearchParams(params);
    tampered.set("Body", "tchau");
    expect(verifyTwilioSignature(url, tampered, signature, "token")).toBe(false);
  });
});

describe("toWhatsappSenderId", () => {
  it("normalizes Meta's formatted display number to Twilio's sender id", () => {
    expect(toWhatsappSenderId("+55 11 91234-5678")).toBe("whatsapp:+5511912345678");
    expect(toWhatsappSenderId("1 (555) 010-0000")).toBe("whatsapp:+15550100000");
  });

  it("throws on a number with no digits", () => {
    expect(() => toWhatsappSenderId("---")).toThrow();
  });
});
