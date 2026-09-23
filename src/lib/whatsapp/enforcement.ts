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
  | { allow: false; reason: "disconnected" | "payment_issue" | "sender_offline" };

export function decideWhatsappSendGate(connection: {
  status: "pending" | "connected" | "disconnected";
  hasPaymentIssue: boolean;
  // Twilio connections only (2026-09-23): the last synced sender status is
  // known and isn't ONLINE -- nothing can be delivered until it recovers.
  // Absent/false for Meta connections, which have no such signal.
  senderOffline?: boolean;
}): WhatsappSendGateDecision {
  if (connection.status !== "connected") return { allow: false, reason: "disconnected" };
  if (connection.hasPaymentIssue) return { allow: false, reason: "payment_issue" };
  if (connection.senderOffline) return { allow: false, reason: "sender_offline" };
  return { allow: true };
}

// 2026-09-22 -- the WhatsApp *entitlement* gate: is this company even paying
// for the channel, distinct from D5's connection-health gate above. WhatsApp
// is a per-plan add-on (`BillingPlan.whatsappIncluded`, the `_wpp` variants
// in plans.ts) layered on a live subscription, not something every
// subscriber gets -- a company on a plain (non-`_wpp`) plan, or with a
// lapsed subscription, must not be able to connect a number or receive
// AI-generated WhatsApp replies, regardless of what
// `company_whatsapp_connections` says. Pure, fed a fresh `company_billing`
// row by both call sites (the connect route, before it talks to Meta at
// all; the inbound webhook, before it resolves a session or persists
// anything) -- same "freshly read, not cached" shape as `decideReplyGate`,
// unlike D5's gate above.
const WHATSAPP_ENTITLED_STATUSES = new Set(["active", "trialing"]);

export type WhatsappPlanGateDecision = { allow: true } | { allow: false; reason: "no_addon" };

export function decideWhatsappPlanGate(billing: {
  subscription_status: string | null;
  whatsappIncluded: boolean;
} | null): WhatsappPlanGateDecision {
  const entitled =
    !!billing &&
    WHATSAPP_ENTITLED_STATUSES.has(billing.subscription_status ?? "") &&
    billing.whatsappIncluded;
  return entitled ? { allow: true } : { allow: false, reason: "no_addon" };
}
