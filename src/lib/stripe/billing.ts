import { createHash } from "node:crypto";
import type { Locale } from "@/i18n/locales";
import { getStripeClient } from "./client";

// Trello P3 -- the Stripe side of plan checkout. Thin wrappers over the SDK
// so the route stays about auth + our own DB and these stay about Stripe.
// No `currency` is ever set: the Prices are BRL-based and Adaptive Pricing
// (enabled in the Dashboard, P1) makes Checkout detect the buyer's country
// by IP and present a converted local price -- Staffra still settles BRL.

// Stripe-hosted pages (Checkout, Billing Portal) otherwise pick their UI
// language from the browser, so a merchant who chose Portuguese in the app
// on an English browser got English trial/billing copy. Pass the app's own
// resolved locale instead. Product name/description are Stripe data and
// don't change with this -- they render exactly as stored on the Product.
const STRIPE_LOCALES = { en: "en", pt: "pt-BR", it: "it" } as const satisfies Record<Locale, string>;

function stripeLocale(locale: Locale): (typeof STRIPE_LOCALES)[Locale] {
  return STRIPE_LOCALES[locale];
}

// Reuse the company's existing Stripe Customer if we already recorded one;
// otherwise create it. The idempotency key guards against a double-submitted
// first checkout leaving two Customers for the same company -- but it must
// vary with the actual request body, not just `companyId`. A key fixed per
// company forever means any later change to name/email (e.g. fixing bad data
// -- see decisions.md, a malformed `companies.email` once reached here)
// collides with Stripe's 24h idempotency cache and 400s with
// `StripeIdempotencyError` instead of retrying cleanly.
export async function getOrCreateStripeCustomer(opts: {
  companyId: string;
  companyName: string;
  email: string | null | undefined;
  existingCustomerId: string | null;
}): Promise<string> {
  if (opts.existingCustomerId) return opts.existingCustomerId;

  const stripe = getStripeClient();
  const requestFingerprint = createHash("sha256")
    .update(`${opts.companyName}|${opts.email ?? ""}`)
    .digest("hex")
    .slice(0, 16);
  const customer = await stripe.customers.create(
    {
      name: opts.companyName,
      email: opts.email ?? undefined,
      metadata: { companyId: opts.companyId },
    },
    { idempotencyKey: `billing-customer:${opts.companyId}:${requestFingerprint}` },
  );
  return customer.id;
}

// A subscription-mode Checkout Session for one plan. `metadata` is carried
// on both the session and the resulting subscription so the P4 webhook can
// read `companyId` / `planKey` off whichever object an event gives it.
//
// No idempotency key here on purpose. Stripe caches an idempotent response
// for 24h and a Checkout Session also expires after 24h, so a stable key
// (`billing-checkout:<companyId>:<planKey>`) would replay a *stale* session
// -- one the customer already completed or let expire -- instead of minting
// a fresh one, leaving them staring at a dead Checkout page. A Session is
// single-use and free; a double-submit just makes a second one that expires
// unused.
export async function createCheckoutSession(opts: {
  customerId: string;
  priceId: string;
  companyId: string;
  planKey: string;
  baseUrl: string;
  /**
   * Trello P8 -- set together, only when the caller (the checkout route)
   * has already confirmed this plan offers a trial AND this user hasn't
   * used one before. `trialUserId` rides on the *subscription's* metadata
   * (not the session's) because the webhook syncs from the subscription --
   * it's what stamps `users.trial_used_at` once the trial actually starts,
   * not merely once a Checkout link is generated (so an abandoned checkout
   * never burns the user's one trial).
   */
  trialPeriodDays?: number;
  trialUserId?: string;
  /**
   * Shown above Checkout's pay button (`custom_text.submit`). Stripe's own
   * trial headline only knows the day count, not our reply cap, so the route
   * passes a localized note about the trial's reply limit here.
   */
  submitMessage?: string;
  /**
   * Where Stripe returns the merchant. Defaults to the billing settings page.
   * Only ever an allowlisted path (see CHECKOUT_RETURN_ALLOWED in the checkout
   * route) -- this ends up in a URL Stripe echoes back, so an
   * attacker-controlled value would be an open redirect.
   */
  returnPath?: string;
  locale: Locale;
}): Promise<{ url: string | null }> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: opts.customerId,
    locale: stripeLocale(opts.locale),
    ...(opts.submitMessage ? { custom_text: { submit: { message: opts.submitMessage } } } : {}),
    line_items: [{ price: opts.priceId, quantity: 1 }],
    metadata: { companyId: opts.companyId, planKey: opts.planKey },
    subscription_data: {
      metadata: {
        companyId: opts.companyId,
        planKey: opts.planKey,
        ...(opts.trialUserId ? { trialUserId: opts.trialUserId } : {}),
      },
      ...(opts.trialPeriodDays ? { trial_period_days: opts.trialPeriodDays } : {}),
    },
    success_url: `${opts.baseUrl}${opts.returnPath ?? "/dashboard/settings/billing"}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.baseUrl}${opts.returnPath ?? "/dashboard/settings/billing"}?checkout=cancel`,
  });
  return { url: session.url };
}

// Plan change on an already-live subscription goes through the Stripe
// Customer Portal (this generic list, or `createPlanSwitchSession` below
// when the merchant already picked a plan in the app), never
// `subscriptions.update` in our code: Stripe Checkout
// can't modify an existing subscription, and owning the swap ourselves means
// owning proration/dunning/idempotency edge cases for a rare action. The
// Portal (Stripe-hosted, configured in the Dashboard) does the swap; P4's
// `customer.subscription.updated` webhook reconciles `company_billing`.
//
// `flow_data` deep-links the session straight to the plan-switch screen for
// this subscription. Omitting `configuration` uses the account's default
// Portal configuration.
export async function createBillingPortalSession(opts: {
  customerId: string;
  returnUrl: string;
  subscriptionId?: string | null;
  locale: Locale;
}): Promise<{ url: string }> {
  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: opts.returnUrl,
    locale: stripeLocale(opts.locale),
    ...(opts.subscriptionId
      ? {
          flow_data: {
            type: "subscription_update",
            subscription_update: { subscription: opts.subscriptionId },
          },
        }
      : {}),
  });
  return { url: session.url };
}

// Plan switch picked on our own billing page. The merchant already chose the
// target plan in the app, so instead of the Portal's generic plan list this
// deep-links straight to Stripe's confirm screen for that one Price
// (`subscription_update_confirm`): Stripe still shows the proration preview,
// charges or schedules the change per the Portal configuration (downgrades
// and annual -> monthly wait for period end), and handles 3DS / declines.
// The target Price must be in the Portal configuration's plan-switch product
// list or Stripe rejects the session -- which is why each WhatsApp variant
// is its own Product (see plans.ts, 2026-09-27).
//
// Returns null when the subscription already sits on `priceId` (nothing to
// confirm); throws on any Stripe error so the caller can fall back to the
// generic plan-switch flow.
export async function createPlanSwitchSession(opts: {
  customerId: string;
  subscriptionId: string;
  priceId: string;
  returnUrl: string;
  locale: Locale;
}): Promise<{ url: string } | null> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(opts.subscriptionId);
  const item = subscription.items.data[0];
  if (!item) throw new Error(`Subscription ${opts.subscriptionId} has no items`);
  if (item.price.id === opts.priceId) return null;

  const session = await stripe.billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: opts.returnUrl,
    locale: stripeLocale(opts.locale),
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: opts.subscriptionId,
        items: [{ id: item.id, price: opts.priceId, quantity: 1 }],
      },
      after_completion: { type: "redirect", redirect: { return_url: opts.returnUrl } },
    },
  });
  return { url: session.url };
}

// Trello P8 -- lets a trialing merchant convert to paid immediately instead
// of waiting out the rest of the trial (typically because they've already
// hit the reduced trial quota). Unlike a plan *swap* (always the Portal,
// per the comment above -- we don't own that proration/dunning surface),
// ending a trial early is a single well-defined Stripe primitive: setting
// `trial_end` to "now" triggers the exact same mechanics as a trial ending
// naturally (billing_cycle_anchor resets to now, one full non-prorated
// invoice charged against the card collected at trial checkout). No Portal
// redirect needed -- this is a direct API call, not a hosted-page flow.
export async function endTrialNow(subscriptionId: string): Promise<void> {
  const stripe = getStripeClient();
  await stripe.subscriptions.update(subscriptionId, { trial_end: "now" });
}
