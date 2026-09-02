import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripeClient } from "./client";
import { getPlan, getPlanByLookupKey, type PlanKey } from "@/lib/billing/plans";

// Trello P4 -- the handlers behind POST /api/webhooks/stripe. Everything
// funnels through `syncBillingFromSubscription`: given a Stripe.Subscription
// (which every relevant event either *is* or points at), it writes the full
// current state onto `company_billing` and, when the billing period has
// advanced, opens the next `company_message_usage` row (the monthly reset).
// Full-state / last-write-wins + `on conflict do nothing` on the usage row
// makes every handler idempotent and order-tolerant, on top of the route's
// event-id dedup.
//
// `plan_key` is derived from the subscription item's `price.lookup_key`
// (the Customer Portal changes the price, never our metadata) -> plans.ts.
// An unrecognised lookup key logs and leaves `plan_key` untouched -- never
// writes a bad value, never touches plans.ts.

type Service = SupabaseClient;

// Our stripe_subscription_status enum. Stripe's Status type is `... |
// OtherString`, so guard before writing to the column.
const KNOWN_STATUSES = new Set([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function expandableId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function unixToIso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

// Stripe periods are whole unix seconds. Compare at second granularity so a
// stored value that happens to carry sub-second precision doesn't read as
// "period changed" on every webhook and spawn spurious usage rows.
function sameSecond(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return Math.floor(Date.parse(a) / 1000) === Math.floor(Date.parse(b) / 1000);
}

async function syncBillingFromSubscription(
  service: Service,
  subscription: Stripe.Subscription,
  opts: { companyId?: string | null } = {},
): Promise<void> {
  const item = subscription.items.data[0];

  // Which company? metadata first (we set it on subscription_data in P3),
  // else the existing company_billing row keyed by subscription id.
  let companyId: string | null = opts.companyId ?? subscription.metadata?.companyId ?? null;
  if (!companyId) {
    const { data } = await service
      .from("company_billing")
      .select("company_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    companyId = (data?.company_id as string | undefined) ?? null;
  }
  if (!companyId) {
    console.error("stripe webhook: subscription with no resolvable company", subscription.id);
    return;
  }

  const { data: existing } = await service
    .from("company_billing")
    .select("plan_key, current_period_start")
    .eq("company_id", companyId)
    .maybeSingle();

  // plan_key from the current price's lookup_key; keep the old one if the
  // key isn't in plans.ts (a Price was swapped without updating the code).
  const lookupKey = item?.price?.lookup_key ?? null;
  const resolvedPlan = lookupKey ? getPlanByLookupKey(lookupKey) : undefined;
  if (lookupKey && !resolvedPlan) {
    console.error(
      `stripe webhook: unknown price lookup_key '${lookupKey}' on subscription ${subscription.id} -- keeping existing plan_key`,
    );
  }
  const effectivePlanKey =
    (resolvedPlan?.key ?? (existing?.plan_key as PlanKey | undefined)) ?? null;

  const periodStart = unixToIso(item?.current_period_start);
  const periodEnd = unixToIso(item?.current_period_end);

  const knownStatus = KNOWN_STATUSES.has(subscription.status) ? subscription.status : null;
  if (!knownStatus) {
    console.error(`stripe webhook: unknown subscription status '${subscription.status}' -- not writing it`);
  }

  // Only the fields the event actually tells us about -- an UPDATE leaves
  // every other column (notably plan_key, when the lookup key is unknown)
  // exactly as it was.
  const fields: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
  };
  const customerId = expandableId(subscription.customer);
  if (customerId) fields.stripe_customer_id = customerId;
  if (knownStatus) fields.subscription_status = knownStatus;
  if (periodStart) fields.current_period_start = periodStart;
  if (periodEnd) fields.current_period_end = periodEnd;
  if (resolvedPlan) fields.plan_key = resolvedPlan.key;

  const { data: updatedRows, error: updateError } = await service
    .from("company_billing")
    .update(fields)
    .eq("company_id", companyId)
    .select("company_id");
  if (updateError) throw new Error(`company_billing update failed: ${updateError.message}`);

  if (!updatedRows || updatedRows.length === 0) {
    // No row yet -- provision one. plan_key is NOT NULL, so this only works
    // if we could resolve a plan (checkout.session.completed always can).
    if (!effectivePlanKey) {
      console.error(
        `stripe webhook: no company_billing row and no resolvable plan for subscription ${subscription.id}`,
      );
      return;
    }
    const { error: insertError } = await service.from("company_billing").insert({
      company_id: companyId,
      plan_key: effectivePlanKey,
      subscription_status: knownStatus ?? "incomplete",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      current_period_start: periodStart,
      current_period_end: periodEnd,
    });
    // 23505 -> a concurrent delivery just inserted it; a later event reconciles.
    if (insertError && insertError.code !== "23505") {
      throw new Error(`company_billing insert failed: ${insertError.message}`);
    }
  }

  // Period rollover (or first provision): a new period_start => open the
  // next usage row, snapshotting the current plan's limit. Idempotent via
  // the unique(company_id, period_start) constraint.
  if (periodStart && !sameSecond(periodStart, existing?.current_period_start ?? null) && effectivePlanKey) {
    const { error: usageError } = await service.from("company_message_usage").upsert(
      {
        company_id: companyId,
        period_start: periodStart,
        replies_used: 0,
        reply_limit: getPlan(effectivePlanKey).monthlyReplyLimit,
      },
      { onConflict: "company_id,period_start", ignoreDuplicates: true },
    );
    if (usageError) throw new Error(`company_message_usage insert failed: ${usageError.message}`);
  }
}

export async function handleCheckoutSessionCompleted(
  service: Service,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const companyId = session.metadata?.companyId ?? null;
  const subscriptionId = expandableId(session.subscription);
  if (!companyId || !subscriptionId) {
    console.error("stripe webhook: checkout.session.completed missing companyId/subscription", session.id);
    return;
  }

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // One-active-subscription guard: a merchant can complete two Checkout
  // Sessions (e.g. Starter then Pro) before finishing either. Keep the one
  // that just completed; cancel any different still-live subscription we
  // had recorded.
  const { data: existing } = await service
    .from("company_billing")
    .select("stripe_subscription_id, subscription_status")
    .eq("company_id", companyId)
    .maybeSingle();
  const priorSubId = existing?.stripe_subscription_id as string | null | undefined;
  if (
    priorSubId &&
    priorSubId !== subscriptionId &&
    LIVE_STATUSES.has((existing?.subscription_status as string) ?? "")
  ) {
    try {
      await stripe.subscriptions.cancel(priorSubId);
      console.error(`stripe webhook: cancelled superseded subscription ${priorSubId} for company ${companyId}`);
    } catch (err) {
      console.error(`stripe webhook: failed to cancel superseded subscription ${priorSubId}`, err);
    }
  }

  await syncBillingFromSubscription(service, subscription, { companyId });
}

// customer.subscription.updated AND .deleted -- the event object is the
// subscription itself; a deleted one carries status 'canceled'.
export async function handleSubscriptionEvent(
  service: Service,
  subscription: Stripe.Subscription,
): Promise<void> {
  await syncBillingFromSubscription(service, subscription);
}

export async function handleInvoicePaid(service: Service, invoice: Stripe.Invoice): Promise<void> {
  // In this API version the subscription reference lives under
  // invoice.parent.subscription_details.subscription.
  const parent = invoice.parent as
    | { subscription_details?: { subscription?: string | { id: string } | null } | null }
    | null
    | undefined;
  const subscriptionId = expandableId(parent?.subscription_details?.subscription ?? null);
  if (!subscriptionId) return; // one-off invoice, nothing subscription-related to sync

  const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
  await syncBillingFromSubscription(service, subscription);
}

export async function dispatchStripeEvent(service: Service, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutSessionCompleted(service, event.data.object as Stripe.Checkout.Session);
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return handleSubscriptionEvent(service, event.data.object as Stripe.Subscription);
    case "invoice.paid":
      return handleInvoicePaid(service, event.data.object as Stripe.Invoice);
    default:
      return; // not a billing event we act on
  }
}
