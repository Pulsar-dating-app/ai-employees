// Trello D5 -- the send-gate a WhatsApp connection must pass before D2's
// webhook even attempts D4's sendWhatsappMessage. Deliberately narrower than
// billing's decideReplyGate (src/lib/billing/enforcement.ts): that pure
// function is fed two DB rows freshly read on every call. This one instead
// reads the *last known* state stored on the connection row, because the
// truth it's checking -- does the WABA have a working payment method --
// isn't something this codebase discovers by reading a fresh row; it's
// written by two separate impure producers (D4's send-time error parsing,
// and the periodic recheck cron) that this gate has no part in. See
// decisions.md for why that split exists.

export type WhatsappSendGateDecision =
  | { allow: true }
  | { allow: false; reason: "disconnected" | "payment_issue" };

export function decideWhatsappSendGate(connection: {
  status: "pending" | "connected" | "disconnected";
  hasPaymentIssue: boolean;
}): WhatsappSendGateDecision {
  if (connection.status !== "connected") return { allow: false, reason: "disconnected" };
  if (connection.hasPaymentIssue) return { allow: false, reason: "payment_issue" };
  return { allow: true };
}
