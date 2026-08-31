import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidTimeZone, addDays } from "@/lib/analytics/load";
import { getValidAccessToken } from "@/lib/google-calendar/connection";
import { queryFreeBusy } from "@/lib/google-calendar/freebusy";
import {
  computeAvailableSlots,
  timeOffToBusyIntervals,
  type BusinessHourWindow,
  type BusyInterval,
  type TimeOffBlock,
} from "./engine";

// Trello I2 -- the IO half of the availability engine: reads the real
// service/company/business_hours/appointments/calendar-connection rows,
// calls out to Google, and hands the gathered inputs to the pure core in
// engine.ts. Mirrors src/lib/analytics/load.ts's split (loadCompanyAnalytics
// wraps aggregateAnalytics the same way this wraps computeAvailableSlots).

export class ServiceNotFoundError extends Error {
  constructor() {
    super("Service not found for this company");
    this.name = "ServiceNotFoundError";
  }
}

export type LoadAvailableSlotsOptions = {
  supabase: SupabaseClient;
  companyId: string;
  serviceId: string;
  from: string; // "YYYY-MM-DD"
  to: string; // "YYYY-MM-DD"
  now?: Date;
};

export type LoadAvailableSlotsResult = {
  slots: { start: string; end: string }[];
  // False whenever the connected calendar wasn't actually consulted (not
  // connected, refresh failed, or the freeBusy call itself failed) --
  // slots are still returned from business_hours + our own appointments
  // alone rather than blocking the whole request on an external outage.
  // See the 2026-08-29 decisions.md entry for the accepted tradeoff.
  googleCalendarChecked: boolean;
  // Merchant-registered time off overlapping [from, to] (inclusive local
  // dates). Non-empty means part of the requested window is blocked off --
  // when it's why `slots` is empty, a caller can say *why* (and `reason`,
  // if the merchant gave one) instead of a bare "nothing available".
  timeOff: { start: string; end: string; reason: string | null }[];
};

export async function loadAvailableSlots(
  opts: LoadAvailableSlotsOptions,
): Promise<LoadAvailableSlotsResult> {
  const { supabase, companyId, serviceId, from, to, now } = opts;

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("duration_minutes, buffer_minutes, is_active")
    .eq("id", serviceId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (serviceError) throw new Error(serviceError.message);
  if (!service || !service.is_active) throw new ServiceNotFoundError();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("timezone")
    .eq("id", companyId)
    .single();
  if (companyError) throw new Error(companyError.message);
  const timezone = company.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";

  const { data: businessHoursRows, error: businessHoursError } = await supabase
    .from("business_hours")
    .select("day_of_week, start_time, end_time")
    .eq("company_id", companyId)
    .eq("is_active", true);
  if (businessHoursError) throw new Error(businessHoursError.message);

  // Widen by a day each side, same idiom as analytics/load.ts's
  // fetchWindow -- the DB query is in UTC and shouldn't miss a row whose
  // local date falls in [from, to] but whose UTC instant spills a day over.
  const windowStartUtc = `${addDays(from, -1)}T00:00:00.000Z`;
  const windowEndUtc = `${addDays(to, 2)}T00:00:00.000Z`;

  const { data: appointmentRows, error: appointmentsError } = await supabase
    .from("appointments")
    .select("starts_at, ends_at")
    .eq("company_id", companyId)
    .not("status", "in", "(cancelled,no_show)")
    .gte("starts_at", windowStartUtc)
    .lt("starts_at", windowEndUtc);
  if (appointmentsError) throw new Error(appointmentsError.message);

  const appointmentBusy: BusyInterval[] = (appointmentRows ?? []).map((a) => ({
    start: a.starts_at,
    end: a.ends_at,
  }));

  // Merchant-registered time off (K3's time-off card). Stored as inclusive
  // local date ranges; a range overlaps the query window when it ends on or
  // after `from` and starts on or before `to`.
  const { data: timeOffRows, error: timeOffError } = await supabase
    .from("company_time_off")
    .select("start_date, end_date, reason")
    .eq("company_id", companyId)
    .gte("end_date", addDays(from, -1))
    .lte("start_date", addDays(to, 1));
  if (timeOffError) throw new Error(timeOffError.message);
  const timeOffRowsSafe = (timeOffRows ?? []) as (TimeOffBlock & { reason: string | null })[];
  const timeOffBusy = timeOffToBusyIntervals(timeOffRowsSafe, timezone);

  const { googleBusy, googleCalendarChecked } = await loadGoogleBusy(
    companyId,
    windowStartUtc,
    windowEndUtc,
  );

  const slots = computeAvailableSlots({
    timezone,
    from,
    to,
    durationMinutes: service.duration_minutes,
    bufferMinutes: service.buffer_minutes,
    businessHours: (businessHoursRows ?? []) as BusinessHourWindow[],
    busy: [...appointmentBusy, ...timeOffBusy, ...googleBusy],
    now,
  });

  return {
    slots,
    googleCalendarChecked,
    timeOff: timeOffRowsSafe.map((r) => ({
      start: r.start_date,
      end: r.end_date,
      reason: r.reason,
    })),
  };
}

// Never throws -- any failure here (not connected, refresh failed, the
// freeBusy call itself failed) degrades to "no Google data" rather than
// blocking the whole availability request on an external dependency being
// down. See the 2026-08-29 decisions.md entry. Connection/token handling is
// shared with Trello I3's appointment-sync.ts via getValidAccessToken.
async function loadGoogleBusy(
  companyId: string,
  timeMin: string,
  timeMax: string,
): Promise<{ googleBusy: BusyInterval[]; googleCalendarChecked: boolean }> {
  const notChecked = { googleBusy: [], googleCalendarChecked: false };

  const connection = await getValidAccessToken(companyId);
  if (!connection) return notChecked;

  try {
    const busy = await queryFreeBusy(connection.accessToken, connection.calendarId, timeMin, timeMax);
    return { googleBusy: busy, googleCalendarChecked: true };
  } catch {
    return notChecked;
  }
}
