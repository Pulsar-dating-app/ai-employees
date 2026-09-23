import { describe, expect, it } from "vitest";
import {
  addressFromCustomerPhone,
  customerPhoneFromAddress,
  normalizeE164,
  toChannelAddress,
} from "@/lib/whatsapp/twilio/phone";

describe("normalizeE164", () => {
  it("accepts E.164 and strips the punctuation people type", () => {
    expect(normalizeE164("+5511999998888")).toBe("+5511999998888");
    expect(normalizeE164(" +55 (11) 99999-8888 ")).toBe("+5511999998888");
    expect(normalizeE164("whatsapp:+14155238886")).toBe("+14155238886");
  });

  it("rejects numbers without a country code rather than guessing one", () => {
    expect(normalizeE164("11999998888")).toBeNull();
    expect(normalizeE164("(11) 99999-8888")).toBeNull();
  });

  it("rejects anything that can't be an E.164 number", () => {
    expect(normalizeE164("")).toBeNull();
    expect(normalizeE164("+")).toBeNull();
    expect(normalizeE164("+0123456789")).toBeNull(); // country codes don't start with 0
    expect(normalizeE164("+123")).toBeNull(); // too short
    expect(normalizeE164("+1234567890123456")).toBeNull(); // too long
    expect(normalizeE164("+55abc11999998888")).toBeNull();
  });
});

describe("customer phone <-> channel address", () => {
  it("stores customers digits-only, whatever shape Twilio sends", () => {
    expect(customerPhoneFromAddress("whatsapp:+5511999998888")).toBe("5511999998888");
    expect(customerPhoneFromAddress("+5511999998888")).toBe("5511999998888");
    expect(customerPhoneFromAddress("5511999998888")).toBe("5511999998888");
  });

  it("round-trips a customer phone back to a Twilio address", () => {
    expect(addressFromCustomerPhone("5511999998888")).toBe("whatsapp:+5511999998888");
    expect(toChannelAddress("+14155238886")).toBe("whatsapp:+14155238886");
  });
});
