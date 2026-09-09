import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { endTrialNow } from "@/lib/stripe/billing";

// Trello P8 -- POST /api/companies/[companyId]/billing/end-trial
//
// Lets a trialing merchant convert to paid right now instead of waiting out
// the rest of the 15 days -- the button for someone who already hit the
// reduced trial quota and wants the plan's full quota today. Admin-gated,
// same shape as the checkout/portal routes.
//
// No hosted-page redirect: `endTrialNow` calls Stripe directly (trial_end =
// "now"), which charges the card collected at trial checkout the same way
// a trial ending naturally would. This route doesn't write company_billing
// itself -- P4's webhook (customer.subscription.updated) syncs the result,
// and the billing page's own reconcile-from-Stripe backstop picks it up
// immediately on the next page load even before the webhook lands.

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
  if (!membership || !["owner", "admin"].includes(membership.role as string)) {
    return {
      error: NextResponse.json(
        { error: "Only company owners/admins can manage billing" },
        { status: 403 },
      ),
    };
  }
  return { error: null };
}

export async function POST(
  _request: Request,
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

  const service = createServiceClient();
  const { data: billing, error: billingError } = await service
    .from("company_billing")
    .select("stripe_subscription_id, subscription_status")
    .eq("company_id", companyId)
    .maybeSingle();
  if (billingError) {
    return NextResponse.json({ error: billingError.message }, { status: 500 });
  }
  if (!billing?.stripe_subscription_id || billing.subscription_status !== "trialing") {
    return NextResponse.json(
      { error: "No active free trial to end", code: "no_active_trial" },
      { status: 400 },
    );
  }

  try {
    await endTrialNow(billing.stripe_subscription_id);
  } catch (err) {
    console.error(`billing end-trial: Stripe update failed for company ${companyId}`, err);
    return NextResponse.json(
      { error: "Couldn't process your payment. Check your card and try again.", code: "end_trial_failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
