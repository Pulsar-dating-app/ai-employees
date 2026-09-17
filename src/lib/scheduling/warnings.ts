import type { SupabaseClient } from "@supabase/supabase-js";

export type SchedulingWarnings = {
  calendarNotConnected: boolean;
  businessHoursEmpty: boolean;
  servicesEmpty: boolean;
};

// Shared by scheduling/layout.tsx (drives the sub-tab warning icons on
// Services/Settings) and dashboard/layout.tsx (rolls the same facts up into
// the sidebar's Scheduling nav item) -- the exact same three queries
// scheduling/page.tsx already runs inline for its own missing-config Alert
// banners, factored out so a third and fourth caller don't reinvent them.
// scheduling/page.tsx's own inline copy is left as-is (already shipped,
// working, not worth touching for this).
export async function getSchedulingWarnings(
  supabase: SupabaseClient,
  companyId: string,
): Promise<SchedulingWarnings> {
  const [{ data: calendarConnection }, { count: businessHoursCount }, { count: servicesCount }] =
    await Promise.all([
      supabase
        .from("company_calendar_connections")
        .select("status")
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("business_hours")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_active", true),
      supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_default", false)
        .eq("is_active", true),
    ]);

  return {
    calendarNotConnected:
      (calendarConnection as { status?: string } | null)?.status !== "connected" &&
      Boolean(process.env.GOOGLE_CLIENT_ID),
    businessHoursEmpty: (businessHoursCount ?? 0) === 0,
    servicesEmpty: (servicesCount ?? 0) === 0,
  };
}
