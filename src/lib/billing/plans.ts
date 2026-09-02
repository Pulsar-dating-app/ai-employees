// Trello P1 -- the plan catalog is *our* data, not Stripe's. Stripe holds
// only the recurring Price amount (immutable once created); everything a
// merchant sees, and everything that gates bot activation, lives here.
//
// Money: the charge happens in BRL (Staffra settles BRL) and Checkout
// presents it in the customer's local currency via Adaptive Pricing -- see
// the P1 card. `priceBrlCents` below is display-only; the authoritative
// amount is the Stripe Price resolved through `stripeLookupKey`.
//
// Billing unit = 1 AI reply, no weighting: one `AgentEngine.run()` that
// sends the customer a message counts 1, on any bot and any channel;
// handoff / silent / errored runs count 0. The monthly allowance is a
// single pool shared across whichever bots are active (K6 toggle).
//
// !! PLACEHOLDERS -- `monthlyReplyLimit` and `priceBrlCents` are NOT final.
// The Stripe sandbox Prices were created at R$999/mo on purpose: lowering a
// price later is easy, raising it on live subscriptions is not. The limit
// that actually gets enforced is a per-company, per-period snapshot on
// `company_message_usage.reply_limit` (Trello P2), seeded from the value
// here but editable per company at any time.

export type PlanKey = "starter" | "pro" | "enterprise";

export interface BillingPlan {
  key: PlanKey;
  displayName: string;
  /**
   * Stripe Price `lookup_key`. Runtime code resolves the Price by this,
   * never by a hard-coded id, so the underlying Price can be swapped
   * (`transfer_lookup_key`) when the real numbers land -- no deploy.
   * `null` for contact-us plans, which have no Price.
   */
  stripeLookupKey: string | null;
  /**
   * The Stripe Price id currently behind `stripeLookupKey`. Kept for
   * reference/debugging only -- resolution goes through the lookup key.
   * `null` for contact-us plans.
   */
  stripePriceId: string | null;
  /**
   * PLACEHOLDER. Monthly AI-reply allowance, seeded into
   * `company_message_usage.reply_limit` (Trello P2) when a period opens.
   */
  monthlyReplyLimit: number;
  /**
   * PLACEHOLDER, display only. The real charge amount/currency comes from
   * the Stripe Price plus Adaptive Pricing, not from this field.
   */
  priceBrlCents: number;
  /** Self-serve = reachable via Stripe Checkout. Enterprise is contact-us. */
  isSelfServe: boolean;
}

export const BILLING_PLANS: readonly BillingPlan[] = [
  {
    key: "starter",
    displayName: "Starter",
    stripeLookupKey: "starter_monthly",
    stripePriceId: "price_1UBD3NHAg1kV3YLS502z3M2I",
    monthlyReplyLimit: 10_000,
    priceBrlCents: 99_900,
    isSelfServe: true,
  },
  {
    key: "pro",
    displayName: "Pro",
    stripeLookupKey: "pro_monthly",
    stripePriceId: "price_1UBD3SHAg1kV3YLSO7xCrO1s",
    monthlyReplyLimit: 10_000,
    priceBrlCents: 99_900,
    isSelfServe: true,
  },
  {
    key: "enterprise",
    displayName: "Enterprise",
    stripeLookupKey: null,
    stripePriceId: null,
    monthlyReplyLimit: 10_000,
    priceBrlCents: 99_900,
    isSelfServe: false,
  },
] as const;

export function getPlan(key: PlanKey): BillingPlan {
  const plan = BILLING_PLANS.find((p) => p.key === key);
  if (!plan) {
    throw new Error(`Unknown billing plan key: ${key}`);
  }
  return plan;
}

/** The plans a merchant can buy without talking to sales (Checkout flow). */
export function getSelfServePlans(): BillingPlan[] {
  return BILLING_PLANS.filter((p) => p.isSelfServe);
}

/** Reverse lookup for the P4 webhook: Stripe hands us a Price/lookup key. */
export function getPlanByLookupKey(lookupKey: string): BillingPlan | undefined {
  return BILLING_PLANS.find((p) => p.stripeLookupKey === lookupKey);
}
