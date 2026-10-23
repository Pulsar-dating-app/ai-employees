import type { SupabaseClient } from "@supabase/supabase-js";
import { findPlan, getPlan, type PlanKey } from "@/lib/billing/plans";
import { computeMetaSpend, type MetaSpend } from "@/lib/whatsapp/meta-pricing";

// What a merchant on their own Meta account (plain plan, `provider = 'meta'`)
// is spending with Meta this calendar month, estimated from the replies
// their numbers sent: Meta bills per reply beyond each number's free tier,
// and every reply Staffra sends (AI or merchant) goes through our own send
// path, so `messages` is a complete count. An estimate, not Meta's invoice:
// it prices every reply at the top of Meta's range and ignores templates.
// Null when there's nothing to show: a `_wpp` plan (Staffra pays Meta), no
// plan, or no connected Meta-direct number.
export async function getMetaSpendSummary(
  supabase: SupabaseClient,
  companyId: string,
  now: Date = new Date(),
): Promise<MetaSpend | null> {
  const { data: billing } = await supabase
    .from("company_billing")
    .select("plan_key")
    .eq("company_id", companyId)
    .maybeSingle();
  const plan = findPlan(billing?.plan_key as string | null);
  if (!plan || plan.whatsappIncluded || plan.tier === "enterprise") return null;

  const { data: connections } = await supabase
    .from("company_whatsapp_connections")
    .select("agent_id")
    .eq("company_id", companyId)
    .eq("provider", "meta")
    .eq("status", "connected");
  if (!connections || connections.length === 0) return null;

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const repliesPerNumber = await Promise.all(
    connections.map(async ({ agent_id }) => {
      const { count } = await supabase
        .from("messages")
        .select("id, conversations!inner(agent_id, channel)", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("role", ["agent", "merchant"])
        .gte("created_at", monthStart)
        .eq("conversations.channel", "whatsapp")
        .eq("conversations.agent_id", agent_id as string);
      return count ?? 0;
    }),
  );

  const monthlyPlan = getPlan(plan.tier as PlanKey);
  return computeMetaSpend({
    repliesPerNumber,
    planMonthlyReplies: monthlyPlan.monthlyReplyLimit ?? 0,
    now,
  });
}
