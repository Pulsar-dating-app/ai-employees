import { describe, expect, it } from "vitest";
import { isEmbedOriginAllowed } from "@/lib/web-chat/embed-authorization";

// Trello M3 -- the domain-allowlist check, pure and unit-tested directly
// (no DB/HTTP needed).
describe("isEmbedOriginAllowed", () => {
  it("allows a direct (non-embedded) visit regardless of the allowlist", () => {
    expect(isEmbedOriginAllowed(null, [])).toBe(true);
    expect(isEmbedOriginAllowed(undefined, ["example.com"])).toBe(true);
  });

  it("allows an exact hostname match", () => {
    expect(isEmbedOriginAllowed("https://example.com/some/page", ["example.com"])).toBe(true);
  });

  it("normalizes a leading www. on either side", () => {
    expect(isEmbedOriginAllowed("https://www.example.com/", ["example.com"])).toBe(true);
    expect(isEmbedOriginAllowed("https://example.com/", ["www.example.com"])).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isEmbedOriginAllowed("https://Example.COM/", ["example.com"])).toBe(true);
  });

  it("blocks a hostname not on the allowlist", () => {
    expect(isEmbedOriginAllowed("https://unrelated-site.com/", ["example.com"])).toBe(false);
  });

  it("blocks everything when the allowlist is empty -- deny-by-default", () => {
    expect(isEmbedOriginAllowed("https://example.com/", [])).toBe(false);
  });

  it("fails closed on a malformed embeddedOn value rather than ignoring it", () => {
    expect(isEmbedOriginAllowed("not a url", ["example.com"])).toBe(false);
  });

  it("fails closed on an empty string -- distinct from null/undefined (a stripped document.referrer is still embedded traffic)", () => {
    expect(isEmbedOriginAllowed("", ["example.com"])).toBe(false);
  });
});
