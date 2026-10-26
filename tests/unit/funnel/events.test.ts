import { describe, expect, it } from "vitest";
import { isFunnelEvent, sanitizeFunnelProperties } from "@/lib/funnel/events";

describe("funnel event allowlist", () => {
  it("accepts only known events", () => {
    expect(isFunnelEvent("link_shared")).toBe(true);
    expect(isFunnelEvent("drop_table")).toBe(false);
    expect(isFunnelEvent(42)).toBe(false);
  });

  it("keeps a few short scalar properties and drops the rest", () => {
    expect(
      sanitizeFunnelProperties({
        surface: "home",
        count: 3,
        ok: true,
        nested: { a: 1 },
        list: [1],
        "Bad-Key": "x",
        long: "y".repeat(500),
        nan: Number.NaN,
      }),
    ).toEqual({ surface: "home", count: 3, ok: true, long: "y".repeat(80) });
    expect(sanitizeFunnelProperties(null)).toEqual({});
    expect(sanitizeFunnelProperties(["a"])).toEqual({});
  });

  it("caps the number of properties", () => {
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${"a".repeat(i)}`, i]));
    expect(Object.keys(sanitizeFunnelProperties(many))).toHaveLength(6);
  });
});
