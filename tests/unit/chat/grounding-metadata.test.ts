import { describe, expect, it } from "vitest";
import {
  countGrounding,
  isUnconfirmedPromise,
  isVerifiedAnswer,
  readGrounding,
  toStoredGrounding,
} from "@/lib/chat/grounding";

describe("toStoredGrounding", () => {
  it("drops violations on a grounded turn but keeps its claim count", () => {
    expect(
      toStoredGrounding({
        status: "grounded",
        violations: [{ kind: "price", text: "R$ 10" }],
        claimCount: 2,
      }),
    ).toEqual({ status: "grounded", violations: [], claims: 2 });
  });

  it("keeps kind and text on an intervention, discarding everything else", () => {
    const stored = toStoredGrounding({
      status: "regenerated",
      violations: [{ kind: "price", text: "R$ 129,90", values: [129.9] } as never],
      claimCount: 1,
    });
    expect(stored).toEqual({
      status: "regenerated",
      violations: [{ kind: "price", text: "R$ 129,90" }],
      claims: 1,
    });
  });

  it("records zero claims for a reply that quoted no figure at all", () => {
    expect(toStoredGrounding({ status: "grounded", violations: [], claimCount: 0 })).toEqual({
      status: "grounded",
      violations: [],
      claims: 0,
    });
  });

  it("treats a missing or nonsense claim count as zero rather than inventing one", () => {
    expect(toStoredGrounding({ status: "grounded", violations: [] })?.claims).toBe(0);
    expect(toStoredGrounding({ status: "grounded", violations: [], claimCount: NaN })?.claims).toBe(0);
    expect(toStoredGrounding({ status: "grounded", violations: [], claimCount: -3 })?.claims).toBe(0);
    expect(toStoredGrounding({ status: "grounded", violations: [], claimCount: 2.7 })?.claims).toBe(2);
  });

  it("caps how many violations a single row can carry", () => {
    const violations = Array.from({ length: 12 }, (_, i) => ({ kind: "stock", text: `${i}` }));
    expect(toStoredGrounding({ status: "blocked", violations, claimCount: 12 })!.violations).toHaveLength(5);
  });

  it("returns null for a status it does not recognise", () => {
    expect(toStoredGrounding({ status: "whatever", violations: [] })).toBeNull();
  });
});

describe("readGrounding", () => {
  it("reads a stored outcome back out of a metadata object", () => {
    const metadata = { usage: { total: 1 }, grounding: { status: "blocked", violations: [], claims: 0 } };
    expect(readGrounding(metadata)).toEqual({ status: "blocked", violations: [], claims: 0 });
  });

  it("survives every shape a legacy or malformed row can have", () => {
    expect(readGrounding(null)).toBeNull();
    expect(readGrounding({})).toBeNull();
    expect(readGrounding({ products: [] })).toBeNull();
    expect(readGrounding({ grounding: null })).toBeNull();
    expect(readGrounding({ grounding: { status: "nope" } })).toBeNull();
  });

  it("reads a pre-claims row as zero claims, never as a verified answer", () => {
    const legacy = readGrounding({ grounding: { status: "grounded", violations: [] } });
    expect(legacy).toEqual({ status: "grounded", violations: [], claims: 0 });
    expect(isVerifiedAnswer(legacy)).toBe(false);
  });

  it("ignores violation entries that are not {kind,text}", () => {
    const grounding = readGrounding({
      grounding: {
        status: "regenerated",
        claims: 1,
        violations: [{ kind: "price", text: "9" }, 5, null, { kind: "price" }],
      },
    });
    expect(grounding).toEqual({
      status: "regenerated",
      violations: [{ kind: "price", text: "9" }],
      claims: 1,
    });
  });
});

describe("isVerifiedAnswer", () => {
  // The bug this function exists to prevent: a greeting with no figure in it
  // is trivially `grounded`, and was being counted as a checked answer.
  it("is false for a grounded reply that had nothing to check", () => {
    expect(isVerifiedAnswer({ status: "grounded", violations: [], claims: 0 })).toBe(false);
  });

  it("is true only for a grounded reply that actually stated a figure", () => {
    expect(isVerifiedAnswer({ status: "grounded", violations: [], claims: 1 })).toBe(true);
  });

  it("is false for an intervention and for nothing at all", () => {
    expect(isVerifiedAnswer({ status: "regenerated", violations: [], claims: 1 })).toBe(false);
    expect(isVerifiedAnswer({ status: "blocked", violations: [], claims: 0 })).toBe(false);
    expect(isVerifiedAnswer(null)).toBe(false);
  });
});

describe("isUnconfirmedPromise", () => {
  it("is true only for a blocked reply", () => {
    expect(isUnconfirmedPromise({ status: "blocked", violations: [], claims: 0 })).toBe(true);
    expect(isUnconfirmedPromise({ status: "regenerated", violations: [], claims: 1 })).toBe(false);
    expect(isUnconfirmedPromise({ status: "grounded", violations: [], claims: 1 })).toBe(false);
    expect(isUnconfirmedPromise(null)).toBe(false);
  });
});

describe("countGrounding", () => {
  it("counts a grounded reply only when it actually stated a figure", () => {
    const counts = countGrounding([
      { grounding: { status: "grounded", violations: [], claims: 2 } },
      { grounding: { status: "grounded", violations: [], claims: 0 } },
      { grounding: { status: "grounded", violations: [], claims: 0 } },
      { grounding: { status: "regenerated", violations: [], claims: 1 } },
      { grounding: { status: "blocked", violations: [], claims: 0 } },
      { products: [] },
      null,
    ]);
    expect(counts).toEqual({ verified: 1, regenerated: 1, blocked: 1 });
  });

  it("reports zeroes for a period with no replies", () => {
    expect(countGrounding([])).toEqual({ verified: 0, regenerated: 0, blocked: 0 });
  });

  it("never counts small talk, however much of it there is", () => {
    const smallTalk = Array.from({ length: 50 }, () => ({
      grounding: { status: "grounded", violations: [], claims: 0 },
    }));
    expect(countGrounding(smallTalk)).toEqual({ verified: 0, regenerated: 0, blocked: 0 });
  });
});
