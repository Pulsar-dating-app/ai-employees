import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isDuringTimeOff,
  isWithinBusinessHours,
  type BusinessHourWindow,
  type TimeOffBlock,
} from "@/lib/availability/engine";
import { effectiveHours, eligibleProfessionals, type HoursRow } from "./rules";

// 2026-09-24 -- reads for the professionals (one schedule each) behind
// multiple schedules per company. Every function takes the Supabase client
// explicitly, so Ana's tools pass their service-role ctx.supabase and API
// routes pass whichever client they already use. companyId always filters
// explicitly, never trusted to RLS alone (Ana's path bypasses RLS).

export type Professional = {
  id: string;
  name: string;
  isActive: boolean;
  position: number;
  usesCustomHours: boolean;
  userId: string | null;
};

export type ProfessionalWithServices = Professional & { serviceIds: string[] };

const PROFESSIONAL_COLUMNS = "id, name, is_active, position, uses_custom_hours, user_id";

function toProfessional(row: Record<string, unknown>): Professional {
  return {
    id: row.id as string,
    name: row.name as string,
    isActive: row.is_active as boolean,
    position: row.position as number,
    usesCustomHours: row.uses_custom_hours as boolean,
    userId: (row.user_id as string | null) ?? null,
  };
}

export async function listProfessionals(
  client: SupabaseClient,
  companyId: string,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): Promise<Professional[]> {
  let query = client
    .from("professionals")
    .select(PROFESSIONAL_COLUMNS)
    .eq("company_id", companyId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(toProfessional);
}

export async function listProfessionalsWithServices(
  client: SupabaseClient,
  companyId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<ProfessionalWithServices[]> {
  const [professionals, { data: links, error }] = await Promise.all([
    listProfessionals(client, companyId, opts),
    client.from("professional_services").select("professional_id, service_id").eq("company_id", companyId),
  ]);
  if (error) throw new Error(error.message);
  const byProfessional = new Map<string, string[]>();
  for (const link of links ?? []) {
    const list = byProfessional.get(link.professional_id as string) ?? [];
    list.push(link.service_id as string);
    byProfessional.set(link.professional_id as string, list);
  }
  return professionals.map((p) => ({ ...p, serviceIds: byProfessional.get(p.id) ?? [] }));
}

export async function getProfessional(
  client: SupabaseClient,
  companyId: string,
  professionalId: string,
): Promise<Professional | null> {
  const { data, error } = await client
    .from("professionals")
    .select(PROFESSIONAL_COLUMNS)
    .eq("company_id", companyId)
    .eq("id", professionalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toProfessional(data) : null;
}

// Ids of every professional (active or not) linked to the service. Empty =
// performed by everyone -- see rules.ts eligibleProfessionals.
export async function linkedProfessionalIds(client: SupabaseClient, serviceId: string): Promise<string[]> {
  const { data, error } = await client
    .from("professional_services")
    .select("professional_id")
    .eq("service_id", serviceId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.professional_id as string);
}

export async function eligibleProfessionalsForService(
  client: SupabaseClient,
  companyId: string,
  serviceId: string,
): Promise<Professional[]> {
  const [active, linked] = await Promise.all([
    listProfessionals(client, companyId),
    linkedProfessionalIds(client, serviceId),
  ]);
  return eligibleProfessionals(active, linked);
}

export type ResolvedProfessional =
  | { ok: true; professional: Professional }
  | { ok: false; reason: "professional_not_found" | "professional_not_for_service" };

// Validates a professional chosen by a caller (Ana's tool args, a dashboard
// form) for a given service: it must belong to the company, be active, and
// perform that service.
export async function resolveProfessionalForService(
  client: SupabaseClient,
  companyId: string,
  professionalId: string,
  serviceId: string,
): Promise<ResolvedProfessional> {
  const [professional, linked] = await Promise.all([
    getProfessional(client, companyId, professionalId),
    linkedProfessionalIds(client, serviceId),
  ]);
  if (!professional || !professional.isActive) return { ok: false, reason: "professional_not_found" };
  if (eligibleProfessionals([professional], linked).length === 0) {
    return { ok: false, reason: "professional_not_for_service" };
  }
  return { ok: true, professional };
}

export async function countActiveProfessionals(client: SupabaseClient, companyId: string): Promise<number> {
  const { count, error } = await client
    .from("professionals")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Every active business_hours row of the company, establishment-wide and
// per-professional alike -- effectiveHours() picks each professional's set.
export async function loadAllHours(client: SupabaseClient, companyId: string): Promise<HoursRow[]> {
  const { data, error } = await client
    .from("business_hours")
    .select("day_of_week, start_time, end_time, professional_id")
    .eq("company_id", companyId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as HoursRow[];
}

// What a write path (booking, reschedule, dashboard edit) checks a time
// against for one professional: their effective hours, and the time off
// that applies to them (the establishment's plus their own).
export async function loadProfessionalConstraints(
  client: SupabaseClient,
  companyId: string,
  professional: Pick<Professional, "id" | "usesCustomHours">,
): Promise<{ hours: BusinessHourWindow[]; timeOff: TimeOffBlock[] }> {
  const [hoursRows, { data: timeOff, error }] = await Promise.all([
    loadAllHours(client, companyId),
    client
      .from("company_time_off")
      .select("start_date, end_date, professional_id")
      .eq("company_id", companyId)
      .or(`professional_id.is.null,professional_id.eq.${professional.id}`),
  ]);
  if (error) throw new Error(error.message);
  return {
    hours: effectiveHours(professional, hoursRows),
    timeOff: (timeOff ?? []).map((row) => ({ start_date: row.start_date as string, end_date: row.end_date as string })),
  };
}

// Write-time check for one professional (dashboard booking/edit routes): the
// time must fit their effective hours and not fall in time off that applies
// to them. Hours are only enforced once the company has set some up at all
// -- "not set up yet" stays permissive, same default the write paths have
// always had. Time off always applies.
export async function fitsProfessionalSchedule(
  client: SupabaseClient,
  companyId: string,
  professional: Pick<Professional, "id" | "usesCustomHours">,
  { timezone, startsAt, durationMinutes }: { timezone: string; startsAt: string; durationMinutes: number },
): Promise<boolean> {
  const [{ hours, timeOff }, hoursConfigured] = await Promise.all([
    loadProfessionalConstraints(client, companyId, professional),
    anyProfessionalHasHours(client, companyId),
  ]);
  if (hoursConfigured && !isWithinBusinessHours({ timezone, businessHours: hours, startsAt, durationMinutes })) {
    return false;
  }
  return !isDuringTimeOff(timeOff, timezone, startsAt);
}

// True when at least one active professional has hours to work -- absence
// means "not set up yet", never "always closed".
export async function anyProfessionalHasHours(client: SupabaseClient, companyId: string): Promise<boolean> {
  const [professionals, rows] = await Promise.all([listProfessionals(client, companyId), loadAllHours(client, companyId)]);
  return professionals.some((p) => effectiveHours(p, rows).length > 0);
}

// Replaces who performs a service ("Quem realiza"): `professionalIds` empty =
// everyone. Validates every id belongs to the company. Written with the
// service-role client -- professional_services has no write grant for
// regular clients; callers authorize first.
export async function setServiceProfessionals(
  service: SupabaseClient,
  companyId: string,
  serviceId: string,
  professionalIds: readonly string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unique = [...new Set(professionalIds)];
  if (unique.length > 0) {
    const { data, error } = await service
      .from("professionals")
      .select("id")
      .eq("company_id", companyId)
      .in("id", unique);
    if (error) return { ok: false, error: error.message };
    if ((data ?? []).length !== unique.length) return { ok: false, error: "unknown professional id" };
  }

  const { error: deleteError } = await service
    .from("professional_services")
    .delete()
    .eq("company_id", companyId)
    .eq("service_id", serviceId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (unique.length > 0) {
    const { error: insertError } = await service
      .from("professional_services")
      .insert(unique.map((professionalId) => ({ professional_id: professionalId, service_id: serviceId, company_id: companyId })));
    if (insertError) return { ok: false, error: insertError.message };
  }
  return { ok: true };
}

export function parseProfessionalIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !id)) return null;
  return value as string[];
}

// Dashboard authorization: company owners/admins manage every professional;
// a plain member manages only the professional linked to them (their own
// schedule, hours, time off and Google connection). `client` is the
// caller's own (RLS-bound) client -- both reads are member-visible.
export async function canManageProfessional(
  client: SupabaseClient,
  companyId: string,
  professionalId: string,
  userId: string,
): Promise<boolean> {
  const [{ data: membership }, { data: professional }] = await Promise.all([
    client.from("company_users").select("role").eq("company_id", companyId).eq("user_id", userId).maybeSingle(),
    client
      .from("professionals")
      .select("user_id")
      .eq("company_id", companyId)
      .eq("id", professionalId)
      .maybeSingle(),
  ]);
  if (!membership || !professional) return false;
  if (["owner", "admin"].includes(membership.role as string)) return true;
  return professional.user_id === userId;
}
