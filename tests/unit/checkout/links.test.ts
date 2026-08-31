import { afterEach, describe, expect, it } from "vitest";
import {
  buildCheckoutUrl,
  CheckoutBaseUrlMissingError,
  generateTrackingId,
  resolveCheckoutBaseUrl,
} from "@/lib/checkout/links";

const ORIGINAL_BASE_URL = process.env.STAFFRA_CHECKOUT_BASE_URL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

// NODE_ENV is readonly in @types/node; these tests deliberately drive the
// production branch, so the assignment is cast rather than restructured.
function setNodeEnv(value: string | undefined) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

afterEach(() => {
  process.env.STAFFRA_CHECKOUT_BASE_URL = ORIGINAL_BASE_URL;
  setNodeEnv(ORIGINAL_NODE_ENV);
});

describe("generateTrackingId", () => {
  it("is URL-safe — no characters that would need escaping in a path", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTrackingId()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("does not repeat across many draws", () => {
    const ids = new Set(Array.from({ length: 2000 }, generateTrackingId));
    expect(ids.size).toBe(2000);
  });

  it("is long enough not to be guessable by hand", () => {
    // 8 random bytes -> 11 base64url chars.
    expect(generateTrackingId().length).toBeGreaterThanOrEqual(11);
  });
});

describe("resolveCheckoutBaseUrl", () => {
  it("uses the configured value", () => {
    process.env.STAFFRA_CHECKOUT_BASE_URL = "https://app.example.com";
    expect(resolveCheckoutBaseUrl()).toBe("https://app.example.com");
  });

  it("strips trailing slashes so the joined path never doubles up", () => {
    process.env.STAFFRA_CHECKOUT_BASE_URL = "https://app.example.com///";
    expect(buildCheckoutUrl("abc")).toBe("https://app.example.com/c/abc");
  });

  it("falls back to localhost outside production", () => {
    delete process.env.STAFFRA_CHECKOUT_BASE_URL;
    setNodeEnv("test");
    expect(resolveCheckoutBaseUrl()).toBe("http://localhost:3000");
  });

  it("throws in production rather than emitting a localhost link to a real customer", () => {
    delete process.env.STAFFRA_CHECKOUT_BASE_URL;
    setNodeEnv("production");
    expect(() => resolveCheckoutBaseUrl()).toThrow(CheckoutBaseUrlMissingError);
  });

  it("treats a blank value as unset", () => {
    process.env.STAFFRA_CHECKOUT_BASE_URL = "   ";
    setNodeEnv("production");
    expect(() => resolveCheckoutBaseUrl()).toThrow(CheckoutBaseUrlMissingError);
  });
});

describe("buildCheckoutUrl", () => {
  it("builds the spec §14 /c/{tracking-id} shape", () => {
    process.env.STAFFRA_CHECKOUT_BASE_URL = "https://app.example.com";
    expect(buildCheckoutUrl("aB3xK9")).toBe("https://app.example.com/c/aB3xK9");
  });
});
