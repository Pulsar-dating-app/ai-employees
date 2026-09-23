import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/whatsapp/twilio/crypto";

describe("Twilio credential encryption", () => {
  const original = process.env.TWILIO_CREDENTIALS_KEY;
  beforeEach(() => {
    process.env.TWILIO_CREDENTIALS_KEY = randomBytes(32).toString("base64");
  });
  afterEach(() => {
    if (original === undefined) delete process.env.TWILIO_CREDENTIALS_KEY;
    else process.env.TWILIO_CREDENTIALS_KEY = original;
  });

  it("round-trips a secret and never stores it in the clear", () => {
    const encrypted = encryptSecret("super-secret-auth-token");
    expect(encrypted).not.toContain("super-secret-auth-token");
    expect(decryptSecret(encrypted)).toBe("super-secret-auth-token");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("fails on a tampered payload or the wrong key", () => {
    const encrypted = encryptSecret("token");
    const parts = encrypted.split(":");
    parts[3] = Buffer.from("tampered-bytes").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();

    process.env.TWILIO_CREDENTIALS_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(encrypted)).toThrow();
  });

  it("rejects an unknown format and a missing or malformed key", () => {
    expect(() => decryptSecret("v9:a:b:c")).toThrow(/format/);
    process.env.TWILIO_CREDENTIALS_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
    delete process.env.TWILIO_CREDENTIALS_KEY;
    expect(() => encryptSecret("x")).toThrow(/not configured/);
  });
});
