import { describe, expect, it } from "vitest";
import { registrationPinFor } from "@/lib/whatsapp/meta-graph-api";

describe("registrationPinFor", () => {
  it("derives the same 6-digit PIN for a number every time, so a retried connect can't hit a PIN mismatch", () => {
    const pin = registrationPinFor("123456789012345");
    expect(pin).toMatch(/^\d{6}$/);
    expect(registrationPinFor("123456789012345")).toBe(pin);
  });

  it("gives different numbers different PINs", () => {
    expect(registrationPinFor("111111111111111")).not.toBe(registrationPinFor("222222222222222"));
  });
});
