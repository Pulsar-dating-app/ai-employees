import { describe, expect, it } from "vitest";
import {
  annualPriceCents,
  BILLING_PLANS,
  findPlan,
  getPlan,
  getPlanByLookupKey,
  getSelfServePlans,
  getSelfServePlansForVariant,
} from "@/lib/billing/plans";

// Trello P1. The plan catalog is hand-maintained config that other billing
// code (Checkout in P3, the webhook in P4) trusts blindly, so the invariants
// it relies on are worth locking down: a typo that points two plans at the
// same lookup key, or a self-serve plan with no Price, would only surface as
// a broken checkout in production.
//
// 2026-09-16: each self-serve tier now has 4 variants (monthly/annual x
// with/without WhatsApp) instead of one, so pricing monotonicity is checked
// per variant (holding period + WhatsApp constant across tiers), not across
// the whole flat catalog -- an annual+WhatsApp Starter naturally costs more
// than a plain monthly Intermediate, and that's not a catalog bug.

const SELF_SERVE_TIERS = ["starter", "intermediate", "pro"] as const;
const VARIANTS = [
  { billingPeriod: "monthly", whatsappIncluded: false },
  { billingPeriod: "monthly", whatsappIncluded: true },
  { billingPeriod: "annual", whatsappIncluded: false },
  { billingPeriod: "annual", whatsappIncluded: true },
] as const;

describe("billing plan catalog (Trello P1)", () => {
  it("has exactly the 13 known plan keys (3 tiers x 4 variants, plus enterprise), each unique", () => {
    const keys = BILLING_PLANS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(13);
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
    expect(enterprise.billingPeriod).toBeNull();
    expect(enterprise.stripeLookupKey).toBeNull();
    expect(enterprise.stripePriceId).toBeNull();
    // Enterprise terms are negotiated per deal, not fixed in the catalog.
    expect(enterprise.monthlyReplyLimit).toBeNull();
    expect(enterprise.priceBrlCents).toBeNull();
    expect(enterprise.trialReplyLimit).toBeNull();
  });

  // Trello P8 -- the free trial is self-serve-only; Enterprise must stay
  // opted out (`null`) so the checkout route never grants one by accident
  // (it also has no self-serve Checkout to trial through at all).
  it("offers a trial on every self-serve plan, with a quota below its normal period limit", () => {
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

  it("prices each tier strictly above the one before it, within the same billing variant", () => {
    for (const variant of VARIANTS) {
      const plans = getSelfServePlansForVariant(variant.billingPeriod, variant.whatsappIncluded);
      expect(plans.map((p) => p.tier)).toEqual([...SELF_SERVE_TIERS]);
      for (let i = 1; i < plans.length; i++) {
        expect(plans[i].priceBrlCents!, plans[i].key).toBeGreaterThan(plans[i - 1].priceBrlCents!);
        expect(plans[i].monthlyReplyLimit!, plans[i].key).toBeGreaterThan(plans[i - 1].monthlyReplyLimit!);
      }
    }
  });

  // 2026-09-27 -- the owner's real prices. Literal on purpose: these must
  // match the Stripe Price amounts, so a change here should be deliberate.
  it("carries the agreed monthly prices and reply quotas", () => {
    const expected = {
      starter: { monthly: 9_700, wpp: 15_000, replies: 1_000 },
      intermediate: { monthly: 29_700, wpp: 45_000, replies: 3_000 },
      pro: { monthly: 49_700, wpp: 75_000, replies: 5_000 },
    };
    for (const tier of SELF_SERVE_TIERS) {
      expect(getPlan(tier).priceBrlCents, tier).toBe(expected[tier].monthly);
      expect(getPlan(`${tier}_wpp` as const).priceBrlCents, tier).toBe(expected[tier].wpp);
      expect(getPlan(tier).monthlyReplyLimit, tier).toBe(expected[tier].replies);
    }
  });

  it("prices each annual variant as 12 months of its monthly price minus 15%, rounded up to a whole real", () => {
    expect(annualPriceCents(9_700)).toBe(99_000); // R$989,40 -> R$990
    expect(annualPriceCents(15_000)).toBe(153_000); // already whole: not bumped to R$1.531
    // The Stripe Price amounts behind the lookup keys (2026-09-28).
    const annualKeys = [
      "starter_annual",
      "starter_annual_wpp",
      "intermediate_annual",
      "intermediate_annual_wpp",
      "pro_annual",
      "pro_annual_wpp",
    ] as const;
    expect(annualKeys.map((k) => getPlan(k).priceBrlCents)).toEqual([
      99_000, 153_000, 303_000, 459_000, 507_000, 765_000,
    ]);
    for (const tier of SELF_SERVE_TIERS) {
      const monthly = getPlan(tier);
      const annual = getPlan(`${tier}_annual` as const);
      const wpp = getPlan(`${tier}_wpp` as const);
      const annualWpp = getPlan(`${tier}_annual_wpp` as const);

      expect(annual.priceBrlCents, tier).toBe(annualPriceCents(monthly.priceBrlCents!));
      expect(annualWpp.priceBrlCents, tier).toBe(annualPriceCents(wpp.priceBrlCents!));
      expect(annual.priceBrlCents! % 100, tier).toBe(0);
      expect(annualWpp.priceBrlCents! % 100, tier).toBe(0);
      expect(wpp.priceBrlCents!, tier).toBeGreaterThan(monthly.priceBrlCents!);

      // Annual variants seed a full year's worth of replies in one lump sum
      // (company_message_usage's period is the Stripe subscription's own
      // period, a year for these) -- see plans.ts's "KNOWN GAP" note.
      expect(annual.monthlyReplyLimit, tier).toBe(monthly.monthlyReplyLimit! * 12);
      expect(wpp.monthlyReplyLimit, tier).toBe(monthly.monthlyReplyLimit);
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

  // 2026-09-22 -- findPlan is getPlan's safe counterpart for a raw
  // `plan_key` DB column value, used by the WhatsApp add-on gate.
  it("findPlan resolves a known key and is undefined for null/unknown", () => {
    expect(findPlan("pro_wpp")?.whatsappIncluded).toBe(true);
    expect(findPlan("gold")).toBeUndefined();
    expect(findPlan(null)).toBeUndefined();
    expect(findPlan(undefined)).toBeUndefined();
  });

  it("reverse-resolves a plan from its Stripe lookup key", () => {
    // Derived from the catalog rather than a literal, so swapping a Price's
    // lookup_key in plans.ts doesn't break this round-trip check.
    const starterLookupKey = getPlan("starter").stripeLookupKey!;
    expect(getPlanByLookupKey(starterLookupKey)?.key).toBe("starter");
    expect(getPlanByLookupKey("nope")).toBeUndefined();
  });

  it("groups a tier's 4 variants under the same tier and displayName", () => {
    for (const tier of SELF_SERVE_TIERS) {
      const variants = getSelfServePlans().filter((p) => p.tier === tier);
      expect(variants).toHaveLength(4);
      expect(new Set(variants.map((p) => p.displayName)).size).toBe(1);
    }
  });
});
