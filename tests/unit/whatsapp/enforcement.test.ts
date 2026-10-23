import { describe, expect, it } from "vitest";
import { decideWhatsappSendGate, decideWhatsappPlanGate, whatsappProviderForPlan } from "@/lib/whatsapp/enforcement";

// Trello D5. Pure gate a WhatsApp connection must pass before D2's webhook
// attempts D4's sendWhatsappMessage. Reads the *last known* state on the
// connection row -- see enforcement.ts's own comment for why this is
// narrower than billing's decideReplyGate.

describe("decideWhatsappSendGate (Trello D5)", () => {
  it("allows a connected connection with no payment issue", () => {
    expect(decideWhatsappSendGate({ status: "connected", hasPaymentIssue: false })).toEqual({ allow: true });
  });

  it("blocks 'disconnected' for every non-connected status", () => {
    for (const status of ["pending", "disconnected"] as const) {
      expect(decideWhatsappSendGate({ status, hasPaymentIssue: false })).toEqual({
        allow: false,
        reason: "disconnected",
      });
    }
  });

  it("blocks 'payment_issue' for a connected connection flagged has_payment_issue", () => {
    expect(decideWhatsappSendGate({ status: "connected", hasPaymentIssue: true })).toEqual({
      allow: false,
      reason: "payment_issue",
    });
  });

  it("disconnected status takes priority over a stale payment-issue flag", () => {
    expect(decideWhatsappSendGate({ status: "disconnected", hasPaymentIssue: true })).toEqual({
      allow: false,
      reason: "disconnected",
    });
  });
});

// 2026-09-22, reworked 2026-10-02. The WhatsApp entitlement gate: every live
// subscription includes WhatsApp, but a Twilio connection (Staffra pays Meta)
// needs a whatsappIncluded (`_wpp`) plan, while a Meta-direct one (the
// merchant's own Meta account) works on any plan.
describe("decideWhatsappPlanGate", () => {
  it("allows a Meta-direct connection on a plain plan", () => {
    for (const subscription_status of ["active", "trialing"]) {
      expect(decideWhatsappPlanGate({ subscription_status, whatsappIncluded: false }, "meta")).toEqual({
        allow: true,
      });
    }
  });

  it("allows a Twilio connection on a whatsappIncluded plan", () => {
    for (const subscription_status of ["active", "trialing"]) {
      expect(decideWhatsappPlanGate({ subscription_status, whatsappIncluded: true }, "twilio")).toEqual({
        allow: true,
      });
    }
  });

  it("allows a Meta-direct connection on a whatsappIncluded plan", () => {
    expect(decideWhatsappPlanGate({ subscription_status: "active", whatsappIncluded: true }, "meta")).toEqual({
      allow: true,
    });
  });

  it("blocks a Twilio connection on a plain plan", () => {
    expect(decideWhatsappPlanGate({ subscription_status: "active", whatsappIncluded: false }, "twilio")).toEqual({
      allow: false,
      reason: "no_addon",
    });
  });

  it("blocks any connection once the subscription has lapsed", () => {
    for (const subscription_status of ["past_due", "canceled", "unpaid", "incomplete", null]) {
      for (const provider of ["meta", "twilio"] as const) {
        expect(decideWhatsappPlanGate({ subscription_status, whatsappIncluded: true }, provider)).toEqual({
          allow: false,
          reason: "no_addon",
        });
      }
    }
  });

  it("blocks when there is no billing row at all", () => {
    expect(decideWhatsappPlanGate(null, "meta")).toEqual({ allow: false, reason: "no_addon" });
  });
});

describe("whatsappProviderForPlan", () => {
  it("connects whatsappIncluded plans through Twilio and plain plans through Meta", () => {
    expect(whatsappProviderForPlan(true)).toBe("twilio");
    expect(whatsappProviderForPlan(false)).toBe("meta");
  });
});
