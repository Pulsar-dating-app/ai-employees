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

// 2026-09-22, reworked 2026-10-02 -- the WhatsApp *entitlement* gate: is
// this company paying for the way this number is connected, distinct from
// D5's connection-health gate above. Every live subscription includes
// WhatsApp; the plan only decides who pays Meta. A plain plan means the
// merchant's own Meta account (`provider = 'meta'`, Meta bills their card);
// a `_wpp` plan (`BillingPlan.whatsappIncluded`) means Staffra connects the
// number through Twilio and pays Meta for them. So a Twilio connection needs
// a `_wpp` plan -- a merchant who downgrades keeps the number registered but
// can't keep using a channel Staffra pays for -- while a Meta-direct one
// works on any plan. Pure, fed a freshly read `company_billing` row by every
// call site (connect route, inbound pipeline, manual inbox reply, agent page).
const WHATSAPP_ENTITLED_STATUSES = new Set(["active", "trialing"]);

export type WhatsappProvider = "meta" | "twilio";

export type WhatsappPlanGateDecision = { allow: true } | { allow: false; reason: "no_addon" };

export function whatsappProviderForPlan(whatsappIncluded: boolean): WhatsappProvider {
  return whatsappIncluded ? "twilio" : "meta";
}

export function decideWhatsappPlanGate(
  billing: { subscription_status: string | null; whatsappIncluded: boolean } | null,
  provider: WhatsappProvider,
): WhatsappPlanGateDecision {
  const entitled =
    !!billing &&
    WHATSAPP_ENTITLED_STATUSES.has(billing.subscription_status ?? "") &&
    (provider === "meta" || billing.whatsappIncluded);
  return entitled ? { allow: true } : { allow: false, reason: "no_addon" };
}
