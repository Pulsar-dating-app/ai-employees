import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { FREE_PLAN_KEY, FREE_REPLY_LIMIT } from "./plans";
import { releaseTwilioNumbersOffPlan } from "@/lib/whatsapp/plan-change";

// Staffra Free has no Stripe subscription, so nothing renews it: the period is
// rolled lazily, at the moment something needs the current one, by the
// `roll_free_plan_period` SQL function (migration 20261023120000). That
// function only ever touches an active Staffra Free row with no Stripe
// subscription; paid plans' periods stay the Stripe webhook's.

type PeriodFacts = {
  plan_key: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
};

/**
 * The company's current period start, rolling Staffra Free's period first if
 * it has ended. Any other plan gets its stored period back untouched, with no
 * query. The roll is service-role only, so callers holding a merchant's
 * client leave `service` out.
 */
export async function currentPeriodStart(
  companyId: string,
  billing: PeriodFacts,
  service?: SupabaseClient,
  now: Date = new Date(),
): Promise<string | null> {
  const ended =
    billing.plan_key === FREE_PLAN_KEY &&
    billing.current_period_end !== null &&
    new Date(billing.current_period_end).getTime() <= now.getTime();
  if (!ended) return billing.current_period_start;

  const { data, error } = await (service ?? createServiceClient()).rpc("roll_free_plan_period", {
    p_company_id: companyId,
    p_reply_limit: FREE_REPLY_LIMIT,
  });
  if (error) {
    console.error("[billing] roll_free_plan_period failed", { companyId, error: error.message });
    return billing.current_period_start;
  }
  return (data as string | null) ?? billing.current_period_start;
}

/**
 * Puts the company on Staffra Free (no Stripe involved). Returns false when it
 * was already on it, so the caller never resets a spent quota.
 */
export async function activateFreePlan(service: SupabaseClient, companyId: string): Promise<boolean> {
  const { data, error } = await service.rpc("activate_free_plan", {
    p_company_id: companyId,
    p_reply_limit: FREE_REPLY_LIMIT,
  });
  if (error) throw new Error(`activate_free_plan failed: ${error.message}`);
  if (!data) return false;

  // Same as a paid plan's first activation (stripe/webhooks.ts): hires the
  // first session parked for lack of a plan go back to work.
  const { error: resumeError } = await service
    .from("company_agents")
    .update({ status: "active" })
    .eq("company_id", companyId)
    .eq("status", "paused");
  if (resumeError) console.error("[billing] could not resume hires on Staffra Free", resumeError);

  // No WhatsApp on Staffra Free, so Staffra stops paying for any Twilio number
  // left over from an earlier `_wpp` plan.
  await releaseTwilioNumbersOffPlan(service, companyId);
  return true;
}
