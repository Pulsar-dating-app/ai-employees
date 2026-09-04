import { describe, expect, it } from "vitest";
import { decideWhatsappSendGate } from "@/lib/whatsapp/enforcement";

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
