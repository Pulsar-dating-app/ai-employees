import { describe, expect, it } from "vitest";
import {
  countGrounding,
  isUnconfirmedPromise,
  readGrounding,
  toStoredGrounding,
} from "@/lib/chat/grounding";

describe("toStoredGrounding", () => {
  it("drops violations on a grounded turn", () => {
    expect(toStoredGrounding({ status: "grounded", violations: [{ kind: "price", text: "R$ 10" }] })).toEqual({
      status: "grounded",
      violations: [],
    });
  });

  it("keeps kind and text on an intervention, discarding everything else", () => {
    const stored = toStoredGrounding({
      status: "regenerated",
      violations: [{ kind: "price", text: "R$ 129,90", values: [129.9] } as never],
    });
    expect(stored).toEqual({ status: "regenerated", violations: [{ kind: "price", text: "R$ 129,90" }] });
  });

  it("caps how many violations a single row can carry", () => {
    const violations = Array.from({ length: 12 }, (_, i) => ({ kind: "stock", text: `${i}` }));
    expect(toStoredGrounding({ status: "blocked", violations })!.violations).toHaveLength(5);
  });

  it("returns null for a status it does not recognise", () => {
    expect(toStoredGrounding({ status: "whatever", violations: [] })).toBeNull();
  });
});

describe("readGrounding", () => {
  it("reads a stored outcome back out of a metadata object", () => {
    const metadata = { usage: { total: 1 }, grounding: { status: "blocked", violations: [] } };
    expect(readGrounding(metadata)).toEqual({ status: "blocked", violations: [] });
  });

  it("survives every shape a legacy or malformed row can have", () => {
    expect(readGrounding(null)).toBeNull();
    expect(readGrounding({})).toBeNull();
    expect(readGrounding({ products: [] })).toBeNull();
    expect(readGrounding({ grounding: null })).toBeNull();
    expect(readGrounding({ grounding: { status: "nope" } })).toBeNull();
  });

  it("ignores violation entries that are not {kind,text}", () => {
    const grounding = readGrounding({
      grounding: { status: "regenerated", violations: [{ kind: "price", text: "9" }, 5, null, { kind: "price" }] },
    });
    expect(grounding).toEqual({ status: "regenerated", violations: [{ kind: "price", text: "9" }] });
  });

  it("treats a missing violations array as no violations rather than failing", () => {
    expect(readGrounding({ grounding: { status: "blocked" } })).toEqual({ status: "blocked", violations: [] });
  });
});

describe("isUnconfirmedPromise", () => {
  it("is true only for a blocked reply", () => {
    expect(isUnconfirmedPromise({ status: "blocked", violations: [] })).toBe(true);
    expect(isUnconfirmedPromise({ status: "regenerated", violations: [] })).toBe(false);
    expect(isUnconfirmedPromise({ status: "grounded", violations: [] })).toBe(false);
    expect(isUnconfirmedPromise(null)).toBe(false);
  });
});

describe("countGrounding", () => {
  it("counts only rows that actually carry a checked outcome", () => {
    const counts = countGrounding([
      { grounding: { status: "grounded", violations: [] } },
      { grounding: { status: "grounded", violations: [] } },
      { grounding: { status: "regenerated", violations: [] } },
      { grounding: { status: "blocked", violations: [] } },
      { products: [] },
      null,
    ]);
    expect(counts).toEqual({ checked: 4, grounded: 2, regenerated: 1, blocked: 1 });
  });

  it("reports zeroes for a period with no checked replies", () => {
    expect(countGrounding([])).toEqual({ checked: 0, grounded: 0, regenerated: 0, blocked: 0 });
  });
});
