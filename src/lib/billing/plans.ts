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
//
// 2026-09-16 -- annual billing + a WhatsApp-included variant. Each self-serve
// tier (Starter/Intermediate/Pro) now has up to 4 catalog entries: the
// original monthly plan (unchanged key, e.g. "starter") plus three new
// additive keys -- "<tier>_annual", "<tier>_wpp" (monthly + WhatsApp) and
// "<tier>_annual_wpp". Existing keys/rows are untouched on purpose, so no
// data migration is needed for companies already on a plan. `tier` groups
// the four variants of one plan for the picker UI; `billingPeriod` and
// `whatsappIncluded` are the two independent toggles a merchant picks
// between. Fictitious placeholder multipliers (owner's ask, 2026-09-16):
// annual = 4x the monthly price, WhatsApp-included = 2x whichever price
// (monthly or annual) it's layered on top of -- e.g. annual_wpp = 8x
// monthly. Real Prices for all 9 new variants exist in the Stripe sandbox
// (same product per tier, one Price per variant, by lookup_key).
//
// !! KNOWN GAP, not fixed here: `company_message_usage`'s period is the
// Stripe subscription's own `current_period_start`/`current_period_end`
// (see stripe/webhooks.ts). For a monthly plan that IS a month, so
// `monthlyReplyLimit` resets every period as the name implies. For an
// *annual* plan that period is a full year, so an annual variant's quota
// here is deliberately set to 12x its monthly counterpart -- the merchant's
// whole year of replies in one lump sum at renewal, not a real per-month
// reset. A true monthly reset under annual billing would need the usage
// period decoupled from the Stripe billing anchor -- real engineering work,
// out of scope while these numbers are still placeholders.

export type PlanTier = "starter" | "intermediate" | "pro" | "enterprise";
export type BillingPeriod = "monthly" | "annual";

export type PlanKey =
  | "starter"
  | "starter_annual"
  | "starter_wpp"
  | "starter_annual_wpp"
  | "intermediate"
  | "intermediate_annual"
  | "intermediate_wpp"
  | "intermediate_annual_wpp"
  | "pro"
  | "pro_annual"
  | "pro_wpp"
  | "pro_annual_wpp"
  | "enterprise";

/** Length of the free trial (Trello P8), for every self-serve plan that
 * offers one. Not a per-plan field -- every plan that offers a trial uses
 * the same length; only the reduced quota differs.
 * 2026-09-21: cut from 15 to 7 days -- reaching the trial reply quota now
 * converts to paid immediately (see enforcement.ts), so the trial no longer
 * needs to run long enough on its own to prove the product. */
export const TRIAL_DAYS = 7;

export interface BillingPlan {
  key: PlanKey;
  displayName: string;
  /** Which of the 3 self-serve tiers (or "enterprise") this variant belongs
   * to -- groups a tier's up-to-4 variants together for the plan picker. */
  tier: PlanTier;
  /** `null` only for `enterprise`, which has no self-serve billing period. */
  billingPeriod: BillingPeriod | null;
  /** Whether this variant bundles Meta's WhatsApp usage cost into the
   * Staffra price, instead of the merchant being billed separately by Meta
   * (see decisions.md 2026-09-05's WhatsApp billing disclosure). */
  whatsappIncluded: boolean;
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
   * PLACEHOLDER. AI-reply allowance for one Stripe billing period, seeded
   * into `company_message_usage.reply_limit` (Trello P2) when a period
   * opens -- a month's worth for a monthly variant, a year's worth (12x)
   * for an annual one; see the file-level "KNOWN GAP" note. `null` for
   * contact-us plans -- Enterprise has no fixed quota, it's negotiated per
   * deal (a real number lives on that company's own `company_message_usage`
   * row, never in this catalog).
   */
  monthlyReplyLimit: number | null;
  /**
   * PLACEHOLDER. The reduced reply allowance during the free trial
   * (`TRIAL_DAYS`). `null` means this plan never offers a trial -- the
   * checkout route only grants one when the chosen plan has a non-null
   * value here. Seeded the same way as `monthlyReplyLimit`, just for the
   * subscription's trialing period instead of a normal one. Every self-serve
   * plan offers the same 500-reply trial regardless of billing period or
   * WhatsApp add-on -- Enterprise never does (no self-serve Checkout to
   * trial through). Reaching this quota does NOT get the normal plan's
   * grace-band head-room (`limits.ts`) -- enforcement.ts converts to paid
   * immediately instead (2026-09-21).
   */
  trialReplyLimit: number | null;
  /**
   * PLACEHOLDER, display only. The real charge amount/currency comes from
   * the Stripe Price plus Adaptive Pricing, not from this field.
   * `null` for contact-us plans -- Enterprise has no fixed price to show.
   */
  priceBrlCents: number | null;
  /** Self-serve = reachable via Stripe Checkout. Enterprise is contact-us. */
  isSelfServe: boolean;
}

// Base monthly figures per tier, kept as one place to derive the annual (x4)
// and WhatsApp-included (x2) placeholder multipliers from -- see the
// file-level comment. Matches the live Stripe sandbox Price amounts, not the
// (slightly stale) BRL figures that used to be hand-typed per plan here.
const BASE = {
  starter: { priceBrlCents: 93_000, monthlyReplyLimit: 10_000 },
  intermediate: { priceBrlCents: 95_000, monthlyReplyLimit: 15_000 },
  pro: { priceBrlCents: 99_900, monthlyReplyLimit: 20_000 },
} as const;

const ANNUAL_MULTIPLIER = 4;
const WPP_MULTIPLIER = 2;
// Exported (unlike ANNUAL_MULTIPLIER/WPP_MULTIPLIER) so trial copy can quote
// the exact number instead of duplicating it as a literal.
export const TRIAL_REPLY_LIMIT = 500;

interface TierPriceIds {
  monthly: string;
  annual: string;
  monthlyWpp: string;
  annualWpp: string;
}

function tierPlans(
  tier: keyof typeof BASE,
  displayName: string,
  lookupPrefix: string,
  priceIds: TierPriceIds,
): BillingPlan[] {
  const base = BASE[tier];
  return [
    {
      key: tier,
      displayName,
      tier,
      billingPeriod: "monthly",
      whatsappIncluded: false,
      stripeLookupKey: `${lookupPrefix}_monthly`,
      stripePriceId: priceIds.monthly,
      monthlyReplyLimit: base.monthlyReplyLimit,
      trialReplyLimit: TRIAL_REPLY_LIMIT,
      priceBrlCents: base.priceBrlCents,
      isSelfServe: true,
    },
    {
      key: `${tier}_annual` as PlanKey,
      displayName,
      tier,
      billingPeriod: "annual",
      whatsappIncluded: false,
      stripeLookupKey: `${lookupPrefix}_annual`,
      stripePriceId: priceIds.annual,
      // 12 months' worth in one lump sum -- see the file-level "KNOWN GAP" note.
      monthlyReplyLimit: base.monthlyReplyLimit * 12,
      trialReplyLimit: TRIAL_REPLY_LIMIT,
      priceBrlCents: base.priceBrlCents * ANNUAL_MULTIPLIER,
      isSelfServe: true,
    },
    {
      key: `${tier}_wpp` as PlanKey,
      displayName,
      tier,
      billingPeriod: "monthly",
      whatsappIncluded: true,
      stripeLookupKey: `${lookupPrefix}_monthly_wpp`,
      stripePriceId: priceIds.monthlyWpp,
      monthlyReplyLimit: base.monthlyReplyLimit,
      trialReplyLimit: TRIAL_REPLY_LIMIT,
      priceBrlCents: base.priceBrlCents * WPP_MULTIPLIER,
      isSelfServe: true,
    },
    {
      key: `${tier}_annual_wpp` as PlanKey,
      displayName,
      tier,
      billingPeriod: "annual",
      whatsappIncluded: true,
      stripeLookupKey: `${lookupPrefix}_annual_wpp`,
      stripePriceId: priceIds.annualWpp,
      monthlyReplyLimit: base.monthlyReplyLimit * 12,
      trialReplyLimit: TRIAL_REPLY_LIMIT,
      priceBrlCents: base.priceBrlCents * ANNUAL_MULTIPLIER * WPP_MULTIPLIER,
      isSelfServe: true,
    },
  ];
}

// All 9 new Prices were created directly in the Stripe sandbox (test mode,
// account acct_1UBCAoHAg1kV3YLS) via the Stripe MCP, same product per tier
// as the existing monthly Price -- see this file's 2026-09-16 comment.
export const BILLING_PLANS: readonly BillingPlan[] = [
  ...tierPlans("starter", "Starter", "starter2", {
    monthly: "price_1UBclEHAg1kV3YLS1ouL6qsM",
    annual: "price_1UGHMzHAg1kV3YLSXP2fUm37",
    monthlyWpp: "price_1UGHN1HAg1kV3YLSIv40R36U",
    annualWpp: "price_1UGHN3HAg1kV3YLSjqZJVFOK",
  }),
  ...tierPlans("intermediate", "Intermediate", "intermediate", {
    monthly: "price_1UFiUfHAg1kV3YLS7Je8CYL3",
    annual: "price_1UGHN7HAg1kV3YLSCUqC4Rsl",
    monthlyWpp: "price_1UGHN9HAg1kV3YLSsJFaKEHP",
    annualWpp: "price_1UGHNBHAg1kV3YLSqsHVYk0v",
  }),
  ...tierPlans("pro", "Pro", "pro", {
    monthly: "price_1UBD3SHAg1kV3YLSO7xCrO1s",
    annual: "price_1UGHNDHAg1kV3YLSka4n7XhG",
    monthlyWpp: "price_1UGHNFHAg1kV3YLSm6OAJy7I",
    annualWpp: "price_1UGHNIHAg1kV3YLStWySXKW7",
  }),
  {
    key: "enterprise",
    displayName: "Enterprise",
    tier: "enterprise",
    billingPeriod: null,
    whatsappIncluded: false,
    stripeLookupKey: null,
    stripePriceId: null,
    monthlyReplyLimit: null,
    trialReplyLimit: null,
    priceBrlCents: null,
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

const TIER_ORDER: readonly PlanTier[] = ["starter", "intermediate", "pro"];

/**
 * The 3 self-serve tiers for one specific billing choice (period + WhatsApp
 * add-on), in ascending tier order -- what the billing page's plan picker
 * renders once a merchant has picked a period/WhatsApp toggle, and what the
 * upgrade/downgrade links compare "next/prev tier" within.
 */
export function getSelfServePlansForVariant(
  billingPeriod: BillingPeriod,
  whatsappIncluded: boolean,
): BillingPlan[] {
  return TIER_ORDER.map((tier) =>
    getSelfServePlans().find(
      (p) => p.tier === tier && p.billingPeriod === billingPeriod && p.whatsappIncluded === whatsappIncluded,
    ),
  ).filter((p): p is BillingPlan => p != null);
}
