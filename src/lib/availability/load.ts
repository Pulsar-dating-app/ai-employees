import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidTimeZone, addDays } from "@/lib/analytics/load";
import { getValidAccessToken } from "@/lib/google-calendar/connection";
import { queryFreeBusy } from "@/lib/google-calendar/freebusy";
import {
  effectiveHours,
  eligibleProfessionals,
  mergeSlotsAcrossProfessionals,
  closedDatesForAll,
  type MergedSlot,
  type ProfessionalRef,
} from "@/lib/professionals/rules";
import { listProfessionals, linkedProfessionalIds, loadAllHours } from "@/lib/professionals/repository";
import { computeAvailableSlots, timeOffToBusyIntervals, type BusyInterval } from "./engine";

// Trello I2 -- the IO half of the availability engine: reads the real
// service/company/business_hours/appointments/calendar-connection rows,
// calls out to Google, and hands the gathered inputs to the pure core in
// engine.ts. Mirrors src/lib/analytics/load.ts's split (loadCompanyAnalytics
// wraps aggregateAnalytics the same way this wraps computeAvailableSlots).
//
// 2026-09-24 -- per professional (see decisions.md "Multiple schedules per
// company"). Each professional has their own hours (inherited from the
// establishment unless customised), time off (the establishment's plus their
// own), appointments and Google calendar, so the engine runs once per
// professional. Everything is read in one batch per call, not per
// professional. With `professionalId` the result is that professional's
// slots; without it ("any professional") slots from every professional who
// performs the service are merged by start time, each naming who is free.

export class ServiceNotFoundError extends Error {
  constructor() {
    super("Service not found for this company");
    this.name = "ServiceNotFoundError";
  }
}

// The requested professional doesn't exist in this company, is inactive, or
// doesn't perform the requested service.
export class ProfessionalNotAvailableError extends Error {
  constructor(readonly reason: "professional_not_found" | "professional_not_for_service") {
    super(reason);
    this.name = "ProfessionalNotAvailableError";
  }
}

export type LoadAvailableSlotsOptions = {
  supabase: SupabaseClient;
  companyId: string;
  serviceId: string;
  from: string; // "YYYY-MM-DD"
  to: string; // "YYYY-MM-DD"
  // Omitted = every professional who performs the service.
  professionalId?: string | null;
  now?: Date;
};

export type LoadAvailableSlotsResult = {
  // Each slot names the professional(s) free at that time -- always exactly
  // one when `professionalId` was given.
  slots: MergedSlot[];
  // The professionals considered (the one requested, or everyone who
  // performs the service), in the merchant's order. Empty when nobody
  // performs the service.
  professionals: ProfessionalRef[];
  // The company has more than one active professional -- callers only name
  // professionals to customers when this is true.
  multipleProfessionals: boolean;
  // False whenever a considered professional's connected calendar wasn't
  // actually consulted (not connected, refresh failed, or the freeBusy call
  // itself failed) -- slots are still returned from business_hours + our
  // own appointments alone rather than blocking the whole request on an
  // external outage. See the 2026-08-29 decisions.md entry.
  googleCalendarChecked: boolean;
  // Time off overlapping [from, to] (inclusive local dates) that explains a
  // gap: the establishment's own, plus -- when one professional was asked
  // for -- theirs. Non-empty means part of the requested window is blocked
  // off, so a caller can say *why* instead of a bare "nothing available".
  timeOff: { start: string; end: string; reason: string | null }[];
  // Local dates in [from, to] nobody considered works on (no hours for that
  // weekday). Distinct from `timeOff` (a one-off closure) and from an empty
  // `slots` (fully booked) -- without it, "we don't work Thursdays" and
  // "Thursday is fully booked" were the same answer.
  closedDates: string[];
};

export async function loadAvailableSlots(opts: LoadAvailableSlotsOptions): Promise<LoadAvailableSlotsResult> {
  const { supabase, companyId, serviceId, from, to, professionalId, now } = opts;

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("duration_minutes, buffer_minutes, is_active")
    .eq("id", serviceId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (serviceError) throw new Error(serviceError.message);
  if (!service || !service.is_active) throw new ServiceNotFoundError();

  // Widen by a day each side, same idiom as analytics/load.ts's
  // fetchWindow -- the DB query is in UTC and shouldn't miss a row whose
  // local date falls in [from, to] but whose UTC instant spills a day over.
  const windowStartUtc = `${addDays(from, -1)}T00:00:00.000Z`;
  const windowEndUtc = `${addDays(to, 2)}T00:00:00.000Z`;

  const [
    { data: company, error: companyError },
    activeProfessionals,
    linkedIds,
    hoursRows,
    { data: appointmentRows, error: appointmentsError },
    { data: timeOffRows, error: timeOffError },
  ] = await Promise.all([
    supabase.from("companies").select("timezone, min_lead_time_minutes").eq("id", companyId).single(),
    listProfessionals(supabase, companyId),
    linkedProfessionalIds(supabase, serviceId),
    loadAllHours(supabase, companyId),
    supabase
      .from("appointments")
      .select("starts_at, ends_at, professional_id")
      .eq("company_id", companyId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("starts_at", windowStartUtc)
      .lt("starts_at", windowEndUtc),
    // Merchant-registered time off. Stored as inclusive local date ranges; a
    // range overlaps the query window when it ends on or after `from` and
    // starts on or before `to`.
    supabase
      .from("company_time_off")
      .select("start_date, end_date, reason, professional_id")
      .eq("company_id", companyId)
      .gte("end_date", addDays(from, -1))
      .lte("start_date", addDays(to, 1)),
  ]);
  if (companyError) throw new Error(companyError.message);
  if (appointmentsError) throw new Error(appointmentsError.message);
  if (timeOffError) throw new Error(timeOffError.message);

  const timezone = company.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";
  const minLeadTimeMinutes = Number(company.min_lead_time_minutes) || 0;

  const eligible = eligibleProfessionals(activeProfessionals, linkedIds);
  let considered = eligible;
  if (professionalId) {
    const chosen = activeProfessionals.find((p) => p.id === professionalId);
    if (!chosen) throw new ProfessionalNotAvailableError("professional_not_found");
    if (!eligible.some((p) => p.id === professionalId)) {
      throw new ProfessionalNotAvailableError("professional_not_for_service");
    }
    considered = [chosen];
  }

  type TimeOffRow = { start_date: string; end_date: string; reason: string | null; professional_id: string | null };
  const allTimeOff = (timeOffRows ?? []) as TimeOffRow[];

  const googleResults = await Promise.all(
    considered.map((p) => loadGoogleBusy(p.id, windowStartUtc, windowEndUtc)),
  );

  const perProfessional = considered.map((professional, index) => {
    const hours = effectiveHours(professional, hoursRows);
    const ownAppointments: BusyInterval[] = (appointmentRows ?? [])
      .filter((a) => a.professional_id === professional.id)
      .map((a) => ({ start: a.starts_at as string, end: a.ends_at as string }));
    const ownTimeOff = allTimeOff.filter(
      (t) => t.professional_id === null || t.professional_id === professional.id,
    );
    const slots = computeAvailableSlots({
      timezone,
      from,
      to,
      durationMinutes: service.duration_minutes,
      bufferMinutes: service.buffer_minutes,
      businessHours: hours,
      busy: [...ownAppointments, ...timeOffToBusyIntervals(ownTimeOff, timezone), ...googleResults[index].googleBusy],
      minLeadTimeMinutes,
      now,
    });
    return {
      professional: { id: professional.id, name: professional.name },
      slots,
      openWeekdays: new Set(hours.map((h) => h.day_of_week)),
    };
  });

  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);

  const explainingTimeOff = allTimeOff.filter((t) =>
    professionalId ? t.professional_id === null || t.professional_id === professionalId : t.professional_id === null,
  );

  return {
    slots: mergeSlotsAcrossProfessionals(perProfessional),
    professionals: considered.map((p) => ({ id: p.id, name: p.name })),
    multipleProfessionals: activeProfessionals.length > 1,
    googleCalendarChecked: googleResults.length > 0 && googleResults.every((r) => r.googleCalendarChecked),
    closedDates: closedDatesForAll(
      dates,
      perProfessional.map((p) => p.openWeekdays),
    ),
    timeOff: explainingTimeOff.map((r) => ({ start: r.start_date, end: r.end_date, reason: r.reason })),
  };
}

// Never throws -- any failure here (not connected, refresh failed, the
// freeBusy call itself failed) degrades to "no Google data" rather than
// blocking the whole availability request on an external dependency being
// down. See the 2026-08-29 decisions.md entry. Connection/token handling is
// shared with Trello I3's appointment-sync.ts via getValidAccessToken.
async function loadGoogleBusy(
  professionalId: string,
  timeMin: string,
  timeMax: string,
): Promise<{ googleBusy: BusyInterval[]; googleCalendarChecked: boolean }> {
  const notChecked = { googleBusy: [], googleCalendarChecked: false };

  const connection = await getValidAccessToken(professionalId);
  if (!connection) return notChecked;

  try {
    const busy = await queryFreeBusy(connection.accessToken, connection.calendarId, timeMin, timeMax);
    return { googleBusy: busy, googleCalendarChecked: true };
  } catch {
    return notChecked;
  }
}
