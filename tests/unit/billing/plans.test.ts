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
  it("has exactly the four known plan keys, each unique", () => {
    const keys = BILLING_PLANS.map((p) => p.key);
    expect(new Set(keys)).toEqual(new Set(["starter", "intermediate", "pro", "enterprise"]));
    expect(keys).toHaveLength(4);
  });

  it("gives every self-serve plan a Stripe Price and lookup key", () => {
    for (const plan of getSelfServePlans()) {
      expect(plan.stripeLookupKey, plan.key).toBeTruthy();
      expect(plan.stripePriceId, plan.key).toMatch(/^price_/);
    }
  });

  it("leaves the contact-us plan with no Stripe Price, quota, or price", () => {
    const enterprise = getPlan("enterprise");
    expect(enterprise.isSelfServe).toBe(false);
    expect(enterprise.stripeLookupKey).toBeNull();
    expect(enterprise.stripePriceId).toBeNull();
    // Enterprise terms are negotiated per deal, not fixed in the catalog.
    expect(enterprise.monthlyReplyLimit).toBeNull();
    expect(enterprise.priceBrlCents).toBeNull();
    expect(enterprise.trialReplyLimit).toBeNull();
  });

  // Trello P8 -- the free trial is self-serve-only (Starter, Intermediate,
  // Pro); Enterprise must stay opted out (`null`) so the checkout route
  // never grants one by accident (it also has no self-serve Checkout to
  // trial through at all).
  it("offers a trial on every self-serve plan, with a quota below its normal monthly limit", () => {
    for (const plan of getSelfServePlans()) {
      expect(plan.trialReplyLimit, plan.key).toBeGreaterThan(0);
      expect(plan.trialReplyLimit!, plan.key).toBeLessThan(plan.monthlyReplyLimit!);
    }

    expect(getPlan("enterprise").trialReplyLimit).toBeNull();
  });

  it("gives every self-serve plan the exact same trial quota", () => {
    const trialLimits = new Set(getSelfServePlans().map((p) => p.trialReplyLimit));
    expect(trialLimits.size).toBe(1);
  });

  it("prices each self-serve plan strictly above the one before it, quota included", () => {
    const plans = getSelfServePlans();
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].priceBrlCents!, plans[i].key).toBeGreaterThan(plans[i - 1].priceBrlCents!);
      expect(plans[i].monthlyReplyLimit!, plans[i].key).toBeGreaterThan(plans[i - 1].monthlyReplyLimit!);
    }
  });

  it("keeps lookup keys unique across plans", () => {
    const lookupKeys = BILLING_PLANS.map((p) => p.stripeLookupKey).filter(
      (k): k is string => k !== null,
    );
    expect(new Set(lookupKeys).size).toBe(lookupKeys.length);
  });

  it("has a positive reply allowance and price on every self-serve plan", () => {
    for (const plan of getSelfServePlans()) {
      expect(plan.monthlyReplyLimit, plan.key).toBeGreaterThan(0);
      expect(plan.priceBrlCents, plan.key).toBeGreaterThan(0);
    }
  });

  it("resolves plans by key and rejects unknown keys", () => {
    expect(getPlan("pro").displayName).toBe("Pro");
    // @ts-expect-error -- exercising the runtime guard with a bad key
    expect(() => getPlan("gold")).toThrow(/Unknown billing plan key/);
  });

  it("reverse-resolves a plan from its Stripe lookup key", () => {
    // Derived from the catalog rather than a literal, so swapping a Price's
    // lookup_key in plans.ts doesn't break this round-trip check.
    const starterLookupKey = getPlan("starter").stripeLookupKey!;
    expect(getPlanByLookupKey(starterLookupKey)?.key).toBe("starter");
    expect(getPlanByLookupKey("nope")).toBeUndefined();
  });
});
