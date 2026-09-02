import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

// The single source of truth for "is this company's billing in good enough
// standing to run a bot". A paid plan is mandatory (no free tier, no
// trial).
const BILLING_ACTIVE_STATUSES = new Set(["active", "trialing"]);

// Trello P3 (stub) -- NOT yet wired as a block. P6 gates the hire route
// (POST) and the K6 activate PATCH (`status: 'active'`) on `company_agents`
// with this: a company can only turn a bot on while it has an active plan.
export async function isBillingActive(
  companyId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = client ?? createServiceClient();
  const { data } = await supabase
    .from("company_billing")
    .select("subscription_status")
    .eq("company_id", companyId)
    .maybeSingle();

  return data ? BILLING_ACTIVE_STATUSES.has(data.subscription_status as string) : false;
}

// Trello P4 reply-gate predicate -- a company that HAS a `company_billing`
// row whose status is not active/trialing has lapsed (card declined ->
// `past_due`, retries exhausted -> `unpaid`, `canceled`, `incomplete`...).
// Its bots go silent on every channel until `invoice.paid` flips the status
// back to `active`. A company with NO row hasn't engaged billing at all --
// that "no plan whatsoever" cut-over is P6's scope, deliberately not this
// gate, so P4 doesn't retroactively switch off every pre-billing company.
//
// As of P7 the live per-channel decision is `evaluateReplyGate`
// (`enforcement.ts`), which folds this exact "lapsed" rule together with the
// reply-quota soft cap. This standalone predicate stays as the unit the P4
// webhook tests assert against.
export async function isBillingLapsed(
  companyId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = client ?? createServiceClient();
  const { data } = await supabase
    .from("company_billing")
    .select("subscription_status")
    .eq("company_id", companyId)
    .maybeSingle();

  return data ? !BILLING_ACTIVE_STATUSES.has(data.subscription_status as string) : false;
}
