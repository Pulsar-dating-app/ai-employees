import type { SupabaseClient } from "@supabase/supabase-js";

export type SetupStepKey = "plan" | "products" | "hours" | "services" | "channel";

export type SetupStep = { key: SetupStepKey; done: boolean; href: string };

export type SetupFacts = {
  hiredSlugs: string[];
  planChosen: boolean;
  productsCount: number;
  hasOpenHours: boolean;
  hasServices: boolean;
  channelLive: boolean;
};

const LIVE_PLAN_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);

export function buildSetupChecklist(facts: SetupFacts): SetupStep[] {
  const hasMalu = facts.hiredSlugs.includes("malu");
  const hasAna = facts.hiredSlugs.includes("ana");
  const channelHref = facts.hiredSlugs[0] ? `/dashboard/my-agents/${facts.hiredSlugs[0]}` : "/dashboard";

  // Only what stops her from answering anyone: what she needs to work at all
  // (onboarding normally covers it), then the channel that puts her in front
  // of customers. Business details and the calendar make her better but are
  // optional, so they are not steps the merchant is told they still owe
  // (2026-11-02).
  const steps: (SetupStep | null)[] = [
    { key: "plan", done: facts.planChosen, href: "/dashboard/settings/billing" },
    hasMalu ? { key: "products", done: facts.productsCount > 0, href: "/dashboard/products" } : null,
    hasAna ? { key: "hours", done: facts.hasOpenHours, href: "/dashboard/scheduling/settings#business-hours" } : null,
    hasAna ? { key: "services", done: facts.hasServices, href: "/dashboard/scheduling/services" } : null,
    { key: "channel", done: facts.channelLive, href: channelHref },
  ];
  return steps.filter((s): s is SetupStep => s !== null);
}

export async function loadPlanAndChannelFacts(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ planChosen: boolean; channelLive: boolean }> {
  const [{ data: billing }, whatsapp, instagram, { data: company }, conversations] = await Promise.all([
    supabase.from("company_billing").select("subscription_status").eq("company_id", companyId).maybeSingle(),
    supabase
      .from("company_whatsapp_connections")
      .select("company_id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "connected"),
    supabase
      .from("company_instagram_connections")
      .select("company_id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "connected"),
    supabase.from("companies").select("allowed_embed_domains").eq("id", companyId).maybeSingle(),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_preview", false),
  ]);

  const domains = ((company as { allowed_embed_domains?: string[] | null } | null)?.allowed_embed_domains ?? []).filter(
    Boolean,
  );
  return {
    planChosen: LIVE_PLAN_STATUSES.has((billing as { subscription_status?: string } | null)?.subscription_status ?? ""),
    channelLive:
      (whatsapp.count ?? 0) > 0 || (instagram.count ?? 0) > 0 || domains.length > 0 || (conversations.count ?? 0) > 0,
  };
}
