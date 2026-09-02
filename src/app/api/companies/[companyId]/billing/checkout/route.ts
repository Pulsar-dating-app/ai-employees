import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPlan, type PlanKey } from "@/lib/billing/plans";
import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";
import {
  createBillingPortalSession,
  createCheckoutSession,
  getOrCreateStripeCustomer,
} from "@/lib/stripe/billing";

// Trello P3 -- POST /api/companies/[companyId]/billing/checkout
//
// A company picks Starter or Pro and pays before it can activate a bot.
// Admin-gated at the app layer (membership alone shouldn't let a plain
// member start a paid subscription) -- same requireAdmin shape as the
// agents PATCH route.
//
// Two outcomes, decided by whether a live subscription already exists:
//  - no live subscription -> a Stripe Checkout Session, { mode: "checkout",
//    url } to redirect to. company_billing gets a stub row (customer id +
//    status 'incomplete', upserted so a concurrent double-submit can't
//    500); P4's webhook fills in the subscription on completion.
//  - already subscribed -> a Stripe Billing Portal session, { mode:
//    "portal", url }, deep-linked to the plan-switch flow. The swap happens
//    on the Portal (Stripe can't change an existing subscription from
//    Checkout, and owning the swap ourselves means owning proration /
//    dunning / idempotency edge cases for a rare action); P4's
//    customer.subscription.updated reconciles company_billing. `planKey` is
//    ignored on this path.
//
// Enterprise is contact-only: 400 pointing at the "fale conosco" CTA.
//
// Currency: the Checkout Session never sets `currency`. The Prices are
// BRL-based; Adaptive Pricing (enabled in the Stripe Dashboard, P1) detects
// the buyer's country by IP and presents a converted local price. No geo
// code here.

async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const { data: membership, error } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!membership) {
    return {
      error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }),
    };
  }
  if (!["owner", "admin"].includes(membership.role as string)) {
    return {
      error: NextResponse.json(
        { error: "Only company owners/admins can manage billing" },
        { status: 403 },
      ),
    };
  }
  return { error: null };
}

const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const adminCheck = await requireAdmin(supabase, companyId, user.id);
  if (adminCheck.error) return adminCheck.error;

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("name, email")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const { data: billing, error: billingError } = await supabase
    .from("company_billing")
    .select("stripe_customer_id, stripe_subscription_id, subscription_status")
    .eq("company_id", companyId)
    .maybeSingle();
  if (billingError) {
    return NextResponse.json({ error: billingError.message }, { status: 500 });
  }

  const returnUrl = `${resolveCheckoutBaseUrl()}/dashboard/settings/billing`;

  // --- Already subscribed -> Customer Portal (planKey ignored) -----------
  const hasLiveSubscription =
    !!billing?.stripe_subscription_id &&
    LIVE_SUBSCRIPTION_STATUSES.includes(billing.subscription_status as string);

  if (hasLiveSubscription) {
    if (!billing!.stripe_customer_id) {
      return NextResponse.json(
        { error: "Billing record is missing its Stripe customer" },
        { status: 500 },
      );
    }
    const { url } = await createBillingPortalSession({
      customerId: billing!.stripe_customer_id,
      returnUrl,
      subscriptionId: billing!.stripe_subscription_id,
    });
    return NextResponse.json({ ok: true, mode: "portal", url });
  }

  // --- No subscription yet -> Checkout ----------------------------------
  const planKey = (await request.json().catch(() => null))?.planKey as unknown;

  if (planKey === "enterprise") {
    return NextResponse.json(
      {
        error: "Enterprise plans are arranged with our team — use the contact option.",
        code: "enterprise_contact_only",
      },
      { status: 400 },
    );
  }
  if (planKey !== "starter" && planKey !== "pro") {
    return NextResponse.json(
      { error: "planKey must be 'starter' or 'pro'" },
      { status: 400 },
    );
  }

  const plan = getPlan(planKey as PlanKey);
  if (!plan.stripePriceId) {
    // starter/pro always have a price; this is a config-drift guard.
    return NextResponse.json(
      { error: `Plan '${planKey}' has no Stripe price configured` },
      { status: 500 },
    );
  }

  const service = createServiceClient();

  const customerId = await getOrCreateStripeCustomer({
    companyId,
    companyName: company.name as string,
    email: (company.email as string | null) ?? user.email,
    existingCustomerId: billing?.stripe_customer_id ?? null,
  });

  // Persist the customer id straight away (stub row on first checkout) so a
  // retry, or the P4 webhook, always has a local anchor. Upsert on
  // company_id: a concurrent double-submit of the very first checkout would
  // otherwise 500 on the unique(company_id) constraint.
  if (!billing) {
    await service.from("company_billing").upsert(
      {
        company_id: companyId,
        stripe_customer_id: customerId,
        plan_key: planKey,
        subscription_status: "incomplete",
      },
      { onConflict: "company_id" },
    );
  } else if (!billing.stripe_customer_id) {
    await service
      .from("company_billing")
      .update({ stripe_customer_id: customerId })
      .eq("company_id", companyId);
  }

  const { url } = await createCheckoutSession({
    customerId,
    priceId: plan.stripePriceId,
    companyId,
    planKey,
    baseUrl: resolveCheckoutBaseUrl(),
  });

  return NextResponse.json({ ok: true, mode: "checkout", url });
}
