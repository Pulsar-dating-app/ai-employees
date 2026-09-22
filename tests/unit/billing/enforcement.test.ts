import { describe, expect, it } from "vitest";
import { decideReplyGate } from "@/lib/billing/enforcement";

// Trello P7. `decideReplyGate` is the pure core of the per-channel billing
// gate -- given the billing row, the current-period usage row, and the
// config, what does the channel do. `evaluateReplyGate` (the async wrapper
// that reads those two rows) is covered end-to-end in
// tests/integration/billing-usage.test.ts.

const active = { subscription_status: "active", current_period_start: "2026-09-01T00:00:00Z" };

describe("decideReplyGate (Trello P7)", () => {
  // The no-billing branch moved out of P6's hire gate and into this one on
  // 2026-09-16; decidePreBillingGate owns it now and is covered in full by
  // tests/unit/billing/pre-billing-gate.test.ts. What matters here is only
  // that this function routes into it instead of waving the company through.
  it("hands a company with no billing row to the pre-billing gate", () => {
    expect(decideReplyGate(null, null, {}, { onboardingCompletedAt: null, freeRepliesUsed: 0 })).toEqual({
      allow: true,
      overPlan: false,
    });
    expect(decideReplyGate(null, null)).toEqual({ allow: false, reason: "no_plan" });
  });

  it("blocks 'lapsed' for every non active/trialing status", () => {
    for (const status of ["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]) {
      expect(decideReplyGate({ subscription_status: status, current_period_start: null }, null), status).toEqual({
        allow: false,
        reason: "lapsed",
      });
    }
  });

  it("allows active/trialing with no usage row yet ('never stop from nowhere')", () => {
    expect(decideReplyGate(active, null)).toEqual({ allow: true, overPlan: false });
    expect(
      decideReplyGate({ subscription_status: "trialing", current_period_start: null }, null),
    ).toEqual({ allow: true, overPlan: false });
  });

  it("allows, not over plan, while under the limit", () => {
    expect(decideReplyGate(active, { replies_used: 50, reply_limit: 100 })).toEqual({
      allow: true,
      overPlan: false,
    });
  });

  it("allows but flags overPlan inside the grace band", () => {
    expect(
      decideReplyGate(active, { replies_used: 100, reply_limit: 100 }, { graceMultiplier: 1.2 }),
    ).toEqual({ allow: true, overPlan: true });
  });

  it("keeps answering past the grace band when the hard stop is disabled", () => {
    expect(
      decideReplyGate(
        active,
        { replies_used: 500, reply_limit: 100 },
        { graceMultiplier: 1.2, hardStopEnabled: false },
      ),
    ).toEqual({ allow: true, overPlan: true });
  });

  it("blocks 'grace_exceeded' past the grace band only when the hard stop is armed", () => {
    expect(
      decideReplyGate(
        active,
        { replies_used: 120, reply_limit: 100 },
        { graceMultiplier: 1.2, hardStopEnabled: true },
      ),
    ).toEqual({ allow: false, reason: "grace_exceeded" });
  });

  // 2026-09-21 -- the trial quota gets no grace head-room and never blocks
  // on usage: hitting it converts to paid instead (evaluateReplyGate fires
  // the Stripe side effect; this pure function only has to never return
  // `grace_exceeded` for a trialing company).
  const trialing = { subscription_status: "trialing", current_period_start: "2026-09-01T00:00:00Z" };

  it("allows a trialing company under its trial quota, not over plan", () => {
    expect(decideReplyGate(trialing, { replies_used: 499, reply_limit: 500 })).toEqual({
      allow: true,
      overPlan: false,
    });
  });

  it("never blocks a trialing company at or past its trial quota, even with the hard stop armed", () => {
    expect(
      decideReplyGate(trialing, { replies_used: 500, reply_limit: 500 }, { hardStopEnabled: true }),
    ).toEqual({ allow: true, overPlan: true });
    expect(
      decideReplyGate(trialing, { replies_used: 5000, reply_limit: 500 }, { hardStopEnabled: true }),
    ).toEqual({ allow: true, overPlan: true });
  });

  it("ignores a paid-plan grace multiplier passed in options while trialing", () => {
    // A grace multiplier that would still be "over_plan" for a paid plan
    // must not create a grace band for a trial -- grace is forced to 1.
    expect(
      decideReplyGate(trialing, { replies_used: 500, reply_limit: 500 }, { graceMultiplier: 1.2 }),
    ).toEqual({ allow: true, overPlan: true });
  });
});
