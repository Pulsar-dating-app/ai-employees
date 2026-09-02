import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";
import { createBillingPortalSession } from "@/lib/stripe/billing";

// Trello P5 -- POST /api/companies/[companyId]/billing/portal
//
// "Manage billing" from the billing settings page: a Stripe Billing Portal
// session opened at its **home** (card, invoices, cancellation) -- no
// `flow_data` deep-link, unlike the P3 checkout route which sends existing
// subscribers straight to the plan-switch flow. Admin-gated, same shape.
// Needs a Stripe customer on record (a company that never checked out has
// nothing to manage).

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

  const { data: billing, error: billingError } = await supabase
    .from("company_billing")
    .select("stripe_customer_id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (billingError) {
    return NextResponse.json({ error: billingError.message }, { status: 500 });
  }
  if (!billing?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account yet", code: "no_billing_account" },
      { status: 400 },
    );
  }

  const { url } = await createBillingPortalSession({
    customerId: billing.stripe_customer_id,
    returnUrl: `${resolveCheckoutBaseUrl()}/dashboard/settings/billing`,
  });

  return NextResponse.json({ ok: true, url });
}
