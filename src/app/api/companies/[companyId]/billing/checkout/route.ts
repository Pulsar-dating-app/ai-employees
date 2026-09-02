import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPlan, type PlanKey } from "@/lib/billing/plans";
import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";
import {
  createCheckoutSession,
  getOrCreateStripeCustomer,
  swapSubscriptionPlan,
} from "@/lib/stripe/billing";

// Trello P3 -- POST /api/companies/[companyId]/billing/checkout
//
// A company picks Starter or Pro and pays before it can activate a bot.
// Admin-gated at the app layer (RLS still lets any member read/write
// company_billing is service-role only anyway, but membership alone
// shouldn't let a plain member start a paid subscription) -- same
// requireAdmin shape as the agents PATCH route.
//
// Two outcomes:
//  - no live subscription yet -> a Stripe Checkout Session, { url } to
//    redirect to. company_billing gets a stub row (customer id + status
//    'incomplete'); P4's webhook fills in the subscription on completion.
//  - already subscribed -> swap the price in place (Starter <-> Pro),
//    prorated, and return { mode: 'plan_change' } with no redirect.
//
// Enterprise is contact-only: 400 pointing at the "fale conosco" CTA.
//
// Currency: never set on the session. The Prices are BRL-based; Adaptive
// Pricing (enabled in the Stripe Dashboard, P1) detects the buyer's country
// by IP and presents a converted local price. No geo code here.

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

  const body = await request.json().catch(() => null);
  const planKey = body?.planKey as unknown;

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

  const service = createServiceClient();

  const customerId = await getOrCreateStripeCustomer({
    companyId,
    companyName: company.name as string,
    email: (company.email as string | null) ?? user.email,
    existingCustomerId: billing?.stripe_customer_id ?? null,
  });

  // Persist the customer id straight away (stub row on first checkout) so a
  // retry, or the P4 webhook, always has a local anchor.
  if (!billing) {
    await service.from("company_billing").insert({
      company_id: companyId,
      stripe_customer_id: customerId,
      plan_key: planKey,
      subscription_status: "incomplete",
    });
  } else if (!billing.stripe_customer_id) {
    await service
      .from("company_billing")
      .update({ stripe_customer_id: customerId })
      .eq("company_id", companyId);
  }

  const hasLiveSubscription =
    !!billing?.stripe_subscription_id &&
    LIVE_SUBSCRIPTION_STATUSES.includes(billing.subscription_status as string);

  if (hasLiveSubscription) {
    const { unchanged } = await swapSubscriptionPlan({
      subscriptionId: billing!.stripe_subscription_id as string,
      newPriceId: plan.stripePriceId,
    });
    // Reflect the intent locally now; P4's customer.subscription.updated
    // webhook is still the authority and will reconcile.
    await service
      .from("company_billing")
      .update({ plan_key: planKey })
      .eq("company_id", companyId);

    return NextResponse.json({ ok: true, mode: "plan_change", planKey, unchanged });
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
