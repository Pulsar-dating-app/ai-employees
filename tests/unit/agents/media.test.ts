import { describe, expect, it } from "vitest";
import { agentPhoto, agentDefaultPhotos, resolveAgentPhoto } from "@/lib/agents/media";

describe("resolveAgentPhoto", () => {
  it("resolves default_1 to the slug's first curated photo", () => {
    expect(resolveAgentPhoto("malu", "default_1", null)).toBe(agentDefaultPhotos("malu")![0]);
  });

  it("resolves default_2 to the slug's second curated photo", () => {
    expect(resolveAgentPhoto("malu", "default_2", null)).toBe(agentDefaultPhotos("malu")![1]);
  });

  it("resolves custom to the stored asset url when one is set", () => {
    expect(resolveAgentPhoto("malu", "custom", "https://example.com/custom.png")).toBe(
      "https://example.com/custom.png",
    );
  });

  it("falls back to the first default if custom is selected but no asset url is stored", () => {
    // Shouldn't happen given the API route's own validation, but a resolver
    // consumed across 6+ display sites should never crash or return null on
    // a row in this shape -- it degrades to a real photo instead.
    expect(resolveAgentPhoto("malu", "custom", null)).toBe(agentPhoto("malu"));
  });

  it("treats a null/unset photoType the same as default_1", () => {
    expect(resolveAgentPhoto("malu", null, null)).toBe(agentPhoto("malu"));
  });

  it("returns null for a slug with no curated defaults configured", () => {
    expect(resolveAgentPhoto("nonexistent-slug", "default_1", null)).toBeNull();
  });

  it("still honors a custom asset url even for a slug with no curated defaults", () => {
    expect(resolveAgentPhoto("nonexistent-slug", "custom", "https://example.com/x.png")).toBe(
      "https://example.com/x.png",
    );
  });
});

describe("agentPhoto / agentDefaultPhotos", () => {
  it("agentPhoto always matches the first entry of agentDefaultPhotos", () => {
    for (const slug of ["malu", "ana"]) {
      expect(agentPhoto(slug)).toBe(agentDefaultPhotos(slug)![0]);
    }
  });

  it("every known agent has two distinct default photos", () => {
    for (const slug of ["malu", "ana"]) {
      const [first, second] = agentDefaultPhotos(slug)!;
      expect(first).not.toBe(second);
    }
  });
});
