import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { currentPeriodStart } from "./free-plan";

export type UsageSummary = { used: number; limit: number };

// The {used, limit} pair the billing settings page already shows (P5), for
// callers outside that page -- the dashboard sidebar's compact tracker and
// the "My Team" page's near/over-limit banner. Same join `evaluateReplyGate`
// / `record_ai_reply` use: company_message_usage matched on company_billing's
// own current_period_start. Returns null when there's nothing to show (no
// billing row, no current-period usage row yet) -- callers hide the UI.
export async function getUsageSummary(
  companyId: string,
  client?: SupabaseClient,
): Promise<UsageSummary | null> {
  const supabase = client ?? createServiceClient();

  const { data: billing } = await supabase
    .from("company_billing")
    .select("plan_key, current_period_start, current_period_end")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!billing?.current_period_start) return null;

  const periodStart = await currentPeriodStart(companyId, {
    plan_key: billing.plan_key as string | null,
    current_period_start: billing.current_period_start as string,
    current_period_end: billing.current_period_end as string | null,
  });

  const { data: usage } = await supabase
    .from("company_message_usage")
    .select("replies_used, reply_limit")
    .eq("company_id", companyId)
    .eq("period_start", periodStart as string)
    .maybeSingle();
  if (!usage) return null;

  return { used: usage.replies_used as number, limit: usage.reply_limit as number };
}
