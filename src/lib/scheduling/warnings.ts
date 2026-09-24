import type { SupabaseClient } from "@supabase/supabase-js";
import { anyProfessionalHasHours } from "@/lib/professionals/repository";

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
//
// 2026-09-24 -- per professional: the calendar warning is "no professional
// has Google connected" (a barbershop may connect only some barbers), and
// the hours warning is "no active professional has hours to work".
export async function getSchedulingWarnings(
  supabase: SupabaseClient,
  companyId: string,
): Promise<SchedulingWarnings> {
  const [{ count: connectedCount }, hasHours, { count: servicesCount }] =
    await Promise.all([
      supabase
        .from("company_calendar_connections")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "connected"),
      anyProfessionalHasHours(supabase, companyId),
      supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_default", false)
        .eq("is_active", true),
    ]);

  return {
    calendarNotConnected: (connectedCount ?? 0) === 0 && Boolean(process.env.GOOGLE_CLIENT_ID),
    businessHoursEmpty: !hasHours,
    servicesEmpty: (servicesCount ?? 0) === 0,
  };
}
