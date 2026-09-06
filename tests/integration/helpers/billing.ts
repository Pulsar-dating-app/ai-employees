import { getTestServiceClient } from "./service-client";

// Trello P6/P7 -- put a company in the state the P4 webhook leaves after a
// completed Stripe Checkout: an active `company_billing` row plus an open
// `company_message_usage` row for the current period.
//
// Needed by any test that hires an agent: P6 gates the hire POST (and the
// K6 `PATCH { status: "active" }`) on `isBillingActive`, so a test company
// with no billing row can't get a hired agent at all.
//
// Idempotent per company -- a second call (e.g. a test that hires both
// Malu and Ana for one company) is a no-op and returns the existing
// period, since `company_billing` is one-row-per-company.

export async function seedActivePlan(
  companyId: string,
  opts: {
    planKey?: string;
    replyLimit?: number;
    repliesUsed?: number;
    periodStart?: string;
    status?: string;
  } = {},
): Promise<{ periodStart: string }> {
  const svc = getTestServiceClient();

  const { data: existing } = await svc
    .from("company_billing")
    .select("current_period_start")
    .eq("company_id", companyId)
    .maybeSingle();
  if (existing) return { periodStart: existing.current_period_start as string };

  const periodStart = opts.periodStart ?? new Date().toISOString();

  const { error: billingError } = await svc.from("company_billing").insert({
    company_id: companyId,
    plan_key: opts.planKey ?? "starter",
    subscription_status: opts.status ?? "active",
    current_period_start: periodStart,
    current_period_end: new Date(new Date(periodStart).getTime() + 30 * 24 * 3600_000).toISOString(),
  });
  if (billingError) throw new Error(`seedActivePlan (company_billing): ${billingError.message}`);

  const { error: usageError } = await svc.from("company_message_usage").insert({
    company_id: companyId,
    period_start: periodStart,
    replies_used: opts.repliesUsed ?? 0,
    reply_limit: opts.replyLimit ?? 10_000,
  });
  if (usageError) throw new Error(`seedActivePlan (company_message_usage): ${usageError.message}`);

  return { periodStart };
}
