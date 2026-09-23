import { describe, expect, it } from "vitest";
import { decideWhatsappSendGate, decideWhatsappPlanGate } from "@/lib/whatsapp/enforcement";

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

  it("blocks 'sender_offline' for a connected Twilio sender whose last synced status isn't ONLINE", () => {
    expect(decideWhatsappSendGate({ status: "connected", hasPaymentIssue: false, senderOffline: true })).toEqual({
      allow: false,
      reason: "sender_offline",
    });
    expect(decideWhatsappSendGate({ status: "connected", hasPaymentIssue: false, senderOffline: false })).toEqual({
      allow: true,
    });
  });

  it("disconnected status takes priority over a stale payment-issue flag", () => {
    expect(decideWhatsappSendGate({ status: "disconnected", hasPaymentIssue: true })).toEqual({
      allow: false,
      reason: "disconnected",
    });
  });
});

// 2026-09-22. The WhatsApp entitlement gate: does this company's plan
// actually include the WhatsApp add-on, checked fresh (not the last-known
// connection-row state decideWhatsappSendGate above reads) by both the
// connect route and the inbound webhook.
describe("decideWhatsappPlanGate (2026-09-22)", () => {
  it("allows an active subscription whose plan includes WhatsApp", () => {
    expect(decideWhatsappPlanGate({ subscription_status: "active", whatsappIncluded: true })).toEqual({
      allow: true,
    });
  });

  it("allows a trialing subscription whose plan includes WhatsApp", () => {
    expect(decideWhatsappPlanGate({ subscription_status: "trialing", whatsappIncluded: true })).toEqual({
      allow: true,
    });
  });

  it("blocks an active subscription on a plan without the add-on", () => {
    expect(decideWhatsappPlanGate({ subscription_status: "active", whatsappIncluded: false })).toEqual({
      allow: false,
      reason: "no_addon",
    });
  });

  it("blocks a whatsappIncluded plan whose subscription has lapsed", () => {
    for (const subscription_status of ["past_due", "canceled", "unpaid", "incomplete", null]) {
      expect(decideWhatsappPlanGate({ subscription_status, whatsappIncluded: true })).toEqual({
        allow: false,
        reason: "no_addon",
      });
    }
  });

  it("blocks when there is no billing row at all", () => {
    expect(decideWhatsappPlanGate(null)).toEqual({ allow: false, reason: "no_addon" });
  });
});
