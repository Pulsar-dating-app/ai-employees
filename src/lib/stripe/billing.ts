import { getStripeClient } from "./client";

// Trello P3 -- the Stripe side of plan checkout. Thin wrappers over the SDK
// so the route stays about auth + our own DB and these stay about Stripe.
// No `currency` is ever set: the Prices are BRL-based and Adaptive Pricing
// (enabled in the Dashboard, P1) makes Checkout detect the buyer's country
// by IP and present a converted local price -- Staffra still settles BRL.

// Reuse the company's existing Stripe Customer if we already recorded one;
// otherwise create it. The idempotency key means a double-submitted first
// checkout can't leave two Customers for the same company.
export async function getOrCreateStripeCustomer(opts: {
  companyId: string;
  companyName: string;
  email: string | null | undefined;
  existingCustomerId: string | null;
}): Promise<string> {
  if (opts.existingCustomerId) return opts.existingCustomerId;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create(
    {
      name: opts.companyName,
      email: opts.email ?? undefined,
      metadata: { companyId: opts.companyId },
    },
    { idempotencyKey: `billing-customer:${opts.companyId}` },
  );
  return customer.id;
}

// A subscription-mode Checkout Session for one plan. `metadata` is carried
// on both the session and the resulting subscription so the P4 webhook can
// read `companyId` / `planKey` off whichever object an event gives it.
export async function createCheckoutSession(opts: {
  customerId: string;
  priceId: string;
  companyId: string;
  planKey: string;
  baseUrl: string;
}): Promise<{ url: string | null }> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: opts.customerId,
      line_items: [{ price: opts.priceId, quantity: 1 }],
      metadata: { companyId: opts.companyId, planKey: opts.planKey },
      subscription_data: {
        metadata: { companyId: opts.companyId, planKey: opts.planKey },
      },
      success_url: `${opts.baseUrl}/dashboard/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${opts.baseUrl}/dashboard/settings/billing?checkout=cancel`,
    },
    { idempotencyKey: `billing-checkout:${opts.companyId}:${opts.planKey}` },
  );
  return { url: session.url };
}

// Starter <-> Pro on an already-live subscription: swap the single line
// item's price in place, prorating the difference now. No-ops if the
// subscription is already on the target price.
export async function swapSubscriptionPlan(opts: {
  subscriptionId: string;
  newPriceId: string;
}): Promise<{ unchanged: boolean }> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(opts.subscriptionId);
  const item = subscription.items.data[0];

  if (item?.price?.id === opts.newPriceId) return { unchanged: true };

  await stripe.subscriptions.update(opts.subscriptionId, {
    items: [{ id: item.id, price: opts.newPriceId }],
    proration_behavior: "create_prorations",
  });
  return { unchanged: false };
}
