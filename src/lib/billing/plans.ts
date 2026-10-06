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
// 2026-09-27 -- real prices and quotas (owner's numbers, see BASE below),
// replacing the R$999/mo-ish placeholders. The limit that actually gets
// enforced is a per-company, per-period snapshot on
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
// between. (The 4x/2x placeholder multipliers from that day were replaced
// by real prices on 2026-09-27: annual = 12 months minus 15%.)
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
  /** Every plan includes WhatsApp. `true` = everything through Staffra: the
   * number connects through Twilio and Meta's fees are in the price. `false`
   * = the merchant's own Meta account: the number connects to Meta directly
   * and Meta bills the merchant's card (see `whatsappProviderForPlan`). */
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
   * AI-reply allowance for one Stripe billing period, seeded
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
   * Display only. The real charge amount/currency comes from
   * the Stripe Price plus Adaptive Pricing, not from this field.
   * `null` for contact-us plans -- Enterprise has no fixed price to show.
   */
  priceBrlCents: number | null;
  /** Self-serve = reachable via Stripe Checkout. Enterprise is contact-us. */
  isSelfServe: boolean;
}

// Monthly prices per tier (2026-10-02, owner's numbers). Every plan includes
// WhatsApp; the two prices are the two ways to pay Meta for it: the plain
// price is the merchant's own Meta account (Meta bills their card), the
// `Wpp` price is everything through Staffra (Twilio, Meta fees included).
// Annual prices are derived: 12 months minus ANNUAL_DISCOUNT, rounded up to
// a whole real. These must match the Stripe Price amounts behind each lookup
// key (sandbox Prices swapped to these amounts 2026-10-05).
const BASE = {
  starter: { monthlyBrlCents: 19_700, monthlyWppBrlCents: 49_700, monthlyReplyLimit: 3_000 },
  intermediate: { monthlyBrlCents: 31_700, monthlyWppBrlCents: 99_700, monthlyReplyLimit: 6_000 },
  pro: { monthlyBrlCents: 49_700, monthlyWppBrlCents: 159_700, monthlyReplyLimit: 10_000 },
} as const;

export const ANNUAL_DISCOUNT = 0.15;

/**
 * A year of `monthlyCents` with the annual discount, rounded UP to a whole
 * real -- prices never show centavos (R$989,40 -> R$990). Integer math on
 * purpose: `x * 0.85` can land a hair above a whole number in floating
 * point and ceil would then add a real.
 */
export function annualPriceCents(monthlyCents: number): number {
  const discountPct = Math.round(ANNUAL_DISCOUNT * 100);
  return Math.ceil((monthlyCents * 12 * (100 - discountPct)) / 10_000) * 100;
}

/**
 * What a year of `plan`'s monthly variant would cost -- the struck-through
 * "full price" shown next to an annual plan. Null for a plan without a
 * catalog price (enterprise).
 */
export function fullYearPriceCents(plan: Pick<BillingPlan, "tier" | "whatsappIncluded">): number | null {
  if (!(plan.tier in BASE)) return null;
  const base = BASE[plan.tier as keyof typeof BASE];
  return (plan.whatsappIncluded ? base.monthlyWppBrlCents : base.monthlyBrlCents) * 12;
}

// Exported so trial copy can quote the exact number instead of duplicating
// it as a literal.
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
      priceBrlCents: base.monthlyBrlCents,
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
      priceBrlCents: annualPriceCents(base.monthlyBrlCents),
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
      priceBrlCents: base.monthlyWppBrlCents,
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
      priceBrlCents: annualPriceCents(base.monthlyWppBrlCents),
      isSelfServe: true,
    },
  ];
}

// 2026-10-05 -- "preço 2.0": 10 Prices re-created at the new amounts (Pro
// without Twilio kept R$497, so its 2 Prices stayed). Same steps as below.
//
// 2026-09-28 -- all 12 Prices re-created at whole-real amounts (R$97 instead
// of R$96,99, etc.); lookup keys moved with `transfer_lookup_key`, the
// Customer Portal's plan-switch list repointed to the new ids, old Prices
// archived.
//
// All 9 new Prices were created directly in the Stripe sandbox (test mode,
// account acct_1UBCAoHAg1kV3YLS) via the Stripe MCP -- see this file's
// 2026-09-16 comment.
//
// 2026-09-27 -- the WhatsApp variants live on their own Product per tier
// ("Staffra <Tier> + WhatsApp"), not on the tier's base Product. The Customer
// Portal allows only one Price per interval per Product in its plan-switch
// list, and a Price can only be switched to if it's on that list -- so with
// both monthly Prices on one Product, "Starter" <-> "Starter + WhatsApp" was
// impossible. Layout now: 6 Products x (monthly, annual). Lookup keys were
// carried over with `transfer_lookup_key`; the old same-Product WPP Prices
// are archived.
export const BILLING_PLANS: readonly BillingPlan[] = [
  ...tierPlans("starter", "Starter", "starter2", {
    monthly: "price_1UNEoPHAg1kV3YLSX8NOynAW",
    annual: "price_1UNEoPHAg1kV3YLSgrIzCE5T",
    monthlyWpp: "price_1UNEoQHAg1kV3YLSlzVzAVaI",
    annualWpp: "price_1UNEoRHAg1kV3YLS2hVBZiT0",
  }),
  ...tierPlans("intermediate", "Intermediate", "intermediate", {
    monthly: "price_1UNEoRHAg1kV3YLSYDKP1Oy3",
    annual: "price_1UNEoSHAg1kV3YLS6QkFjYX9",
    monthlyWpp: "price_1UNEoTHAg1kV3YLSTD0yUmvP",
    annualWpp: "price_1UNEoUHAg1kV3YLSbQZWbYwi",
  }),
  ...tierPlans("pro", "Pro", "pro", {
    monthly: "price_1UKfWgHAg1kV3YLSVNOXlbNS",
    annual: "price_1UKfWhHAg1kV3YLS58i4Lwkt",
    monthlyWpp: "price_1UNEoUHAg1kV3YLS8S0dXSpH",
    annualWpp: "price_1UNEoVHAg1kV3YLS45rnfxNb",
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

/** Safe variant of `getPlan` for a `plan_key` read straight off a DB row --
 * `undefined` instead of throwing on `null`/an unrecognised value, rather
 * than every such call site needing its own try/catch. */
export function findPlan(key: string | null | undefined): BillingPlan | undefined {
  return key ? BILLING_PLANS.find((p) => p.key === key) : undefined;
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
