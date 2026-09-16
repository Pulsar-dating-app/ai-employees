import { describe, expect, it } from "vitest";
import { decidePreBillingGate, decideReplyGate } from "@/lib/billing/enforcement";

const OPTS = { freeReplyAllowance: 5 };

describe("decidePreBillingGate", () => {
  it("lets a merchant still inside the first session try her out", () => {
    expect(
      decidePreBillingGate({ onboardingCompletedAt: null, freeRepliesUsed: 0 }, OPTS),
    ).toEqual({ allow: true, overPlan: false });
  });

  it("blocks the moment the first session is finished", () => {
    expect(
      decidePreBillingGate(
        { onboardingCompletedAt: "2026-09-16T10:00:00Z", freeRepliesUsed: 0 },
        OPTS,
      ),
    ).toEqual({ allow: false, reason: "no_plan" });
  });

  // The hole the allowance exists to close: the /talk link works from the
  // moment a merchant hires, so "never press finish" would otherwise be free
  // customer service forever.
  it("blocks once the allowance is spent, even mid-onboarding", () => {
    expect(
      decidePreBillingGate({ onboardingCompletedAt: null, freeRepliesUsed: 5 }, OPTS),
    ).toEqual({ allow: false, reason: "no_plan" });
    expect(
      decidePreBillingGate({ onboardingCompletedAt: null, freeRepliesUsed: 9 }, OPTS),
    ).toEqual({ allow: false, reason: "no_plan" });
  });

  it("allows right up to the last free reply", () => {
    expect(
      decidePreBillingGate({ onboardingCompletedAt: null, freeRepliesUsed: 4 }, OPTS).allow,
    ).toBe(true);
  });

  it("fails closed when there is no company row to read", () => {
    expect(decidePreBillingGate(null, OPTS)).toEqual({ allow: false, reason: "no_plan" });
  });

  it("treats an allowance of zero as no free replies at all", () => {
    expect(
      decidePreBillingGate(
        { onboardingCompletedAt: null, freeRepliesUsed: 0 },
        { freeReplyAllowance: 0 },
      ),
    ).toEqual({ allow: false, reason: "no_plan" });
  });
});

describe("decideReplyGate routing into the pre-billing branch", () => {
  it("sends a company with no billing row through the allowance", () => {
    expect(
      decideReplyGate(null, null, OPTS, { onboardingCompletedAt: null, freeRepliesUsed: 0 }),
    ).toEqual({ allow: true, overPlan: false });
    expect(
      decideReplyGate(null, null, OPTS, { onboardingCompletedAt: "2026-09-16", freeRepliesUsed: 0 }),
    ).toEqual({ allow: false, reason: "no_plan" });
  });

  it("blocks a no-billing company when the caller loaded no pre-billing facts", () => {
    expect(decideReplyGate(null, null, OPTS)).toEqual({ allow: false, reason: "no_plan" });
  });

  it("leaves every paying path exactly as it was", () => {
    const active = { subscription_status: "active", current_period_start: "2026-09-01" };
    expect(decideReplyGate(active, null, OPTS)).toEqual({ allow: true, overPlan: false });
    expect(decideReplyGate(active, { replies_used: 5, reply_limit: 100 }, OPTS)).toEqual({
      allow: true,
      overPlan: false,
    });
    expect(
      decideReplyGate({ subscription_status: "past_due", current_period_start: null }, null, OPTS),
    ).toEqual({ allow: false, reason: "lapsed" });
  });
});
