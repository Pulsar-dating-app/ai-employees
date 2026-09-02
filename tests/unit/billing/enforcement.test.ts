import { describe, expect, it } from "vitest";
import { decideReplyGate } from "@/lib/billing/enforcement";

// Trello P7. `decideReplyGate` is the pure core of the per-channel billing
// gate -- given the billing row, the current-period usage row, and the
// config, what does the channel do. `evaluateReplyGate` (the async wrapper
// that reads those two rows) is covered end-to-end in
// tests/integration/billing-usage.test.ts.

const active = { subscription_status: "active", current_period_start: "2026-09-01T00:00:00Z" };

describe("decideReplyGate (Trello P7)", () => {
  it("allows a company with no billing row (pre-billing -- the cut-over is P6)", () => {
    expect(decideReplyGate(null, null)).toEqual({ allow: true, overPlan: false });
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
});
