import type { SupabaseClient } from "@supabase/supabase-js";
import { PREDEFINED_INTAKE_FIELDS, PREDEFINED_INTAKE_KEYS } from "@/lib/appointments/intake-fields";
import { effectiveHours } from "@/lib/professionals/rules";
import { listProfessionals, loadAllHours } from "@/lib/professionals/repository";

export type SchedulingSetup = {
  openDays: number;
  servicesCount: number;
  calendarConnected: boolean;
  calendarAvailable: boolean;
  // 2026-09-24 -- active professionals (one schedule each) and how many of
  // them have Google Calendar connected.
  professionalsCount: number;
  calendarsConnected: number;
  requiresApproval: boolean;
  intakeCount: number;
};

export async function loadSchedulingSetup(supabase: SupabaseClient, companyId: string): Promise<SchedulingSetup> {
  const [hoursRows, professionals, { count: servicesCount }, { data: calendars }, { data: company }, { data: intake }] =
    await Promise.all([
      loadAllHours(supabase, companyId),
      listProfessionals(supabase, companyId),
      supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_default", false)
        .eq("is_active", true),
      supabase.from("company_calendar_connections").select("professional_id, status").eq("company_id", companyId),
      supabase.from("companies").select("requires_appointment_approval").eq("id", companyId).maybeSingle(),
      supabase.from("appointment_intake_fields").select("key, is_enabled").eq("company_id", companyId),
    ]);

  const intakeRows = (intake ?? []) as { key: string; is_enabled: boolean }[];
  const byKey = new Map(intakeRows.map((f) => [f.key, f]));
  const intakeCount =
    PREDEFINED_INTAKE_FIELDS.filter((f) => byKey.get(f.key)?.is_enabled ?? f.defaultEnabled).length +
    intakeRows.filter((f) => !PREDEFINED_INTAKE_KEYS.has(f.key)).length;

  // Days someone works, across every active professional's effective hours.
  const openDays = new Set(professionals.flatMap((p) => effectiveHours(p, hoursRows).map((h) => h.day_of_week)));
  const activeIds = new Set(professionals.map((p) => p.id));
  const calendarsConnected = ((calendars ?? []) as { professional_id: string; status: string }[]).filter(
    (c) => c.status === "connected" && activeIds.has(c.professional_id),
  ).length;

  return {
    openDays: openDays.size,
    servicesCount: servicesCount ?? 0,
    calendarConnected: calendarsConnected > 0,
    calendarAvailable: Boolean(process.env.GOOGLE_CLIENT_ID),
    professionalsCount: professionals.length,
    calendarsConnected,
    requiresApproval: Boolean(
      (company as { requires_appointment_approval?: boolean } | null)?.requires_appointment_approval,
    ),
    intakeCount,
  };
}
