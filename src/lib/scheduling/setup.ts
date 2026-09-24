import type { SupabaseClient } from "@supabase/supabase-js";
import { PREDEFINED_INTAKE_FIELDS, PREDEFINED_INTAKE_KEYS } from "@/lib/appointments/intake-fields";

export type SchedulingSetup = {
  openDays: number;
  servicesCount: number;
  calendarConnected: boolean;
  calendarAvailable: boolean;
  requiresApproval: boolean;
  intakeCount: number;
};

export async function loadSchedulingSetup(supabase: SupabaseClient, companyId: string): Promise<SchedulingSetup> {
  const [{ data: hours }, { count: servicesCount }, { data: calendar }, { data: company }, { data: intake }] =
    await Promise.all([
      supabase.from("business_hours").select("day_of_week").eq("company_id", companyId).eq("is_active", true),
      supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_default", false)
        .eq("is_active", true),
      supabase.from("company_calendar_connections").select("status").eq("company_id", companyId).maybeSingle(),
      supabase.from("companies").select("requires_appointment_approval").eq("id", companyId).maybeSingle(),
      supabase.from("appointment_intake_fields").select("key, is_enabled").eq("company_id", companyId),
    ]);

  const intakeRows = (intake ?? []) as { key: string; is_enabled: boolean }[];
  const byKey = new Map(intakeRows.map((f) => [f.key, f]));
  const intakeCount =
    PREDEFINED_INTAKE_FIELDS.filter((f) => byKey.get(f.key)?.is_enabled ?? f.defaultEnabled).length +
    intakeRows.filter((f) => !PREDEFINED_INTAKE_KEYS.has(f.key)).length;

  return {
    openDays: new Set(((hours ?? []) as { day_of_week: number }[]).map((h) => h.day_of_week)).size,
    servicesCount: servicesCount ?? 0,
    calendarConnected: (calendar as { status?: string } | null)?.status === "connected",
    calendarAvailable: Boolean(process.env.GOOGLE_CLIENT_ID),
    requiresApproval: Boolean(
      (company as { requires_appointment_approval?: boolean } | null)?.requires_appointment_approval,
    ),
    intakeCount,
  };
}
