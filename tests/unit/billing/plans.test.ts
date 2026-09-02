import { describe, expect, it } from "vitest";
import {
  BILLING_PLANS,
  getPlan,
  getPlanByLookupKey,
  getSelfServePlans,
} from "@/lib/billing/plans";

// Trello P1. The plan catalog is hand-maintained config that other billing
// code (Checkout in P3, the webhook in P4) trusts blindly, so the invariants
// it relies on are worth locking down: a typo that points two plans at the
// same lookup key, or a self-serve plan with no Price, would only surface as
// a broken checkout in production.

describe("billing plan catalog (Trello P1)", () => {
  it("has exactly the three known plan keys, each unique", () => {
    const keys = BILLING_PLANS.map((p) => p.key);
    expect(new Set(keys)).toEqual(new Set(["starter", "pro", "enterprise"]));
    expect(keys).toHaveLength(3);
  });

  it("gives every self-serve plan a Stripe Price and lookup key", () => {
    for (const plan of getSelfServePlans()) {
      expect(plan.stripeLookupKey, plan.key).toBeTruthy();
      expect(plan.stripePriceId, plan.key).toMatch(/^price_/);
    }
  });

  it("leaves the contact-us plan with no Stripe Price", () => {
    const enterprise = getPlan("enterprise");
    expect(enterprise.isSelfServe).toBe(false);
    expect(enterprise.stripeLookupKey).toBeNull();
    expect(enterprise.stripePriceId).toBeNull();
  });

  it("keeps lookup keys unique across plans", () => {
    const lookupKeys = BILLING_PLANS.map((p) => p.stripeLookupKey).filter(
      (k): k is string => k !== null,
    );
    expect(new Set(lookupKeys).size).toBe(lookupKeys.length);
  });

  it("has a positive reply allowance on every plan", () => {
    for (const plan of BILLING_PLANS) {
      expect(plan.monthlyReplyLimit, plan.key).toBeGreaterThan(0);
    }
  });

  it("resolves plans by key and rejects unknown keys", () => {
    expect(getPlan("pro").displayName).toBe("Pro");
    // @ts-expect-error -- exercising the runtime guard with a bad key
    expect(() => getPlan("gold")).toThrow(/Unknown billing plan key/);
  });

  it("reverse-resolves a plan from its Stripe lookup key", () => {
    expect(getPlanByLookupKey("starter_monthly")?.key).toBe("starter");
    expect(getPlanByLookupKey("nope")).toBeUndefined();
  });
});
