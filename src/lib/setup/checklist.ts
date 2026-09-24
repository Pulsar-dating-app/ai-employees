import type { SupabaseClient } from "@supabase/supabase-js";

export type SetupStepKey = "plan" | "business" | "products" | "hours" | "services" | "calendar" | "channel";

export type SetupStep = { key: SetupStepKey; done: boolean; href: string };

export type SetupFacts = {
  hiredSlugs: string[];
  planChosen: boolean;
  businessInfoFilled: boolean;
  productsCount: number;
  hasOpenHours: boolean;
  hasServices: boolean;
  calendarAvailable: boolean;
  calendarConnected: boolean;
  channelLive: boolean;
};

const LIVE_PLAN_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);

export function buildSetupChecklist(facts: SetupFacts): SetupStep[] {
  const hasMalu = facts.hiredSlugs.includes("malu");
  const hasAna = facts.hiredSlugs.includes("ana");
  const channelHref = facts.hiredSlugs[0] ? `/dashboard/my-agents/${facts.hiredSlugs[0]}` : "/dashboard";

  const steps: (SetupStep | null)[] = [
    { key: "plan", done: facts.planChosen, href: "/dashboard/settings/billing" },
    { key: "business", done: facts.businessInfoFilled, href: "/dashboard/settings" },
    hasMalu ? { key: "products", done: facts.productsCount > 0, href: "/dashboard/products" } : null,
    hasAna ? { key: "hours", done: facts.hasOpenHours, href: "/dashboard/scheduling/settings#business-hours" } : null,
    hasAna ? { key: "services", done: facts.hasServices, href: "/dashboard/scheduling/services" } : null,
    hasAna && facts.calendarAvailable
      ? { key: "calendar", done: facts.calendarConnected, href: "/dashboard/scheduling/settings#google-calendar" }
      : null,
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
