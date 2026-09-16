import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { decidePreBillingGate } from "./enforcement";

// The single source of truth for "is this company's billing in good enough
// standing to run a bot". A paid plan is mandatory to serve customers -- the
// only replies that happen without one are the small pre-plan allowance the
// first session spends on its proof step (see enforcement.ts).
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

// A payment-failure predicate, narrower than isBillingLapsed: only
// `past_due`/`unpaid` (a card declined, retries in progress or exhausted).
// Deliberately excludes `canceled`/`incomplete`/`incomplete_expired` --
// those already get their own "choose a plan" messaging (P5, P6's
// activation gate), which is a different situation for a merchant to see
// than "your payment failed, fix your card". Used to decide whether to
// show the dashboard-wide BillingPastDueAlert / "team is paused" banners.
const PAST_DUE_STATUSES = new Set(["past_due", "unpaid"]);

export async function isBillingPastDue(
  companyId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = client ?? createServiceClient();
  const { data } = await supabase
    .from("company_billing")
    .select("subscription_status")
    .eq("company_id", companyId)
    .maybeSingle();

  return data ? PAST_DUE_STATUSES.has(data.subscription_status as string) : false;
}

// The other reason a team can be silent: no plan was ever chosen, and either
// the first session is over or the free allowance is spent. Distinct from
// past-due — the merchant did not fail a payment, they never started one — so
// it reads as "pick a plan", never "fix your card".
export async function isSilentForNoPlan(
  companyId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = client ?? createServiceClient();

  const { data: billing } = await supabase
    .from("company_billing")
    .select("company_id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (billing) return false;

  const { data: company } = await supabase
    .from("companies")
    .select("onboarding_completed_at, free_replies_used")
    .eq("id", companyId)
    .maybeSingle();
  const facts = company as { onboarding_completed_at: string | null; free_replies_used: number } | null;
  if (!facts) return false;

  return !decidePreBillingGate({
    onboardingCompletedAt: facts.onboarding_completed_at,
    freeRepliesUsed: facts.free_replies_used ?? 0,
  }).allow;
}
