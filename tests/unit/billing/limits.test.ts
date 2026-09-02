import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyUsage, getGraceMultiplier, isHardStopEnabled } from "@/lib/billing/limits";

// Trello P7. The soft-cap band math and its two env knobs. Pure logic, so
// it's pinned here rather than left to the integration suite -- an
// off-by-one at the limit/grace boundary is exactly the kind of thing that
// would otherwise only show up as a customer's bot going quiet a few
// replies early or late.

describe("classifyUsage (Trello P7)", () => {
  const grace = 1.2;

  it("is 'within' below 100% of the limit", () => {
    expect(classifyUsage(0, 100, grace)).toBe("within");
    expect(classifyUsage(99, 100, grace)).toBe("within");
  });

  it("is 'over_plan' from the limit up to (not including) limit * grace", () => {
    expect(classifyUsage(100, 100, grace)).toBe("over_plan");
    expect(classifyUsage(119, 100, grace)).toBe("over_plan");
  });

  it("is 'past_grace' at and beyond limit * grace", () => {
    expect(classifyUsage(120, 100, grace)).toBe("past_grace");
    expect(classifyUsage(500, 100, grace)).toBe("past_grace");
  });

  it("treats a non-positive limit as 'within' -- an unusable limit never silences a bot", () => {
    expect(classifyUsage(1000, 0, grace)).toBe("within");
    expect(classifyUsage(1000, -5, grace)).toBe("within");
  });

  it("defaults the multiplier to the env-backed value when omitted", () => {
    // Default grace is 1.2, so 100/100 is still inside the band.
    expect(classifyUsage(100, 100)).toBe("over_plan");
    expect(classifyUsage(120, 100)).toBe("past_grace");
  });
});

describe("getGraceMultiplier (Trello P7)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to 1.2 when unset or empty", () => {
    vi.stubEnv("BILLING_GRACE_MULTIPLIER", "");
    expect(getGraceMultiplier()).toBe(1.2);
  });

  it("reads a valid override", () => {
    vi.stubEnv("BILLING_GRACE_MULTIPLIER", "1.5");
    expect(getGraceMultiplier()).toBe(1.5);
  });

  it("falls back on garbage or a sub-1 value rather than collapsing the grace band", () => {
    vi.stubEnv("BILLING_GRACE_MULTIPLIER", "not-a-number");
    expect(getGraceMultiplier()).toBe(1.2);
    vi.stubEnv("BILLING_GRACE_MULTIPLIER", "0.5");
    expect(getGraceMultiplier()).toBe(1.2);
  });
});

describe("isHardStopEnabled (Trello P7)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off by default", () => {
    vi.stubEnv("BILLING_HARD_STOP_ENABLED", undefined as unknown as string);
    expect(isHardStopEnabled()).toBe(false);
  });

  it("only 'true' arms it", () => {
    vi.stubEnv("BILLING_HARD_STOP_ENABLED", "true");
    expect(isHardStopEnabled()).toBe(true);
    vi.stubEnv("BILLING_HARD_STOP_ENABLED", "1");
    expect(isHardStopEnabled()).toBe(false);
    vi.stubEnv("BILLING_HARD_STOP_ENABLED", "yes");
    expect(isHardStopEnabled()).toBe(false);
  });
});
