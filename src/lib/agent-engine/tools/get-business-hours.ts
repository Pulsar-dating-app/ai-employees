import type { AgentTool } from "./types";
import { addDays, isValidTimeZone } from "@/lib/analytics/load";
import { zonedTimeToUtc } from "@/lib/availability/engine";
import { effectiveHours, minutesOfDay, statusAtMinute, type HoursRow, type StatusAt } from "@/lib/professionals/rules";
import { listProfessionals, loadAllHours } from "@/lib/professionals/repository";
import { PROFESSIONAL_ID_PARAM, professionalIdArg } from "./professional-param";

// "What time do you open?" is one of the most common things anyone asks a
// business, and until now no tool could answer it: get_business_information
// reads `companies` (name, contact, address, industry) and the opening hours
// live in their own table, reachable only through find_available_slots --
// which answers "when can I book", a different question. So a scheduling
// agent whose merchant had just configured opening hours would say she had
// none on file. Honest, per her grounding rules, and wrong.
//
// 2026-09-24 -- hours can be per professional. Without `professionalId` this
// returns the establishment's hours (business_hours.professional_id NULL); a
// business whose professionals all keep their own schedule may have none,
// and then it is open whenever anyone works. With `professionalId`, that
// professional's effective hours (their own, or the establishment's they
// inherit).
//
// Also 2026-09-24 -- `from`/`to` return, per date, whether it's open and why
// not (a weekday nobody works, or time off with its reason). Found in
// testing: "tem horário amanhã com o Tobias?" was answered with "qual
// serviço?" -- implying yes -- because the only tool that knew about Tobias'
// time off (find_available_slots) needs a service. A day being open doesn't
// depend on the service, so this answers it first.
//
// 2026-09-28 -- `time` ("HH:MM", with `from`) adds `atTime`: who is free at
// that moment of that day, and when a busy professional frees up. Found in
// testing: "amanhã às 10h com o Bruno" went through professional and service
// questions before Ana learned Bruno had a 10h booking. A booking at a moment
// doesn't depend on the service, so it's known from day + time + professional.
// Our own bookings, hours and time off only -- no Google call, and no
// duration: a long service can still run into a later booking, which
// find_available_slots settles once the service is known.
//
// Read-only and company-scoped from ctx, like every other tool here.
const MAX_RANGE_DAYS = 31;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

// A UTC instant as the business's local date and minute of day.
function localDateAndMinute(timezone: string, instant: string): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function describeStatus(status: StatusAt) {
  if (status.free) return { free: true };
  if (status.reason === "busy") {
    return { free: false, reason: "busy", freeFrom: status.freeFrom === null ? null : hhmm(status.freeFrom) };
  }
  return { free: false, reason: status.reason };
}

type DateStatus = { date: string; open: boolean; reason?: "closed" | "time_off"; timeOffReason?: string | null };

export const getBusinessHoursTool: AgentTool = {
  name: "get_business_hours",
  description:
    "Get the days and times this business is open, as configured by the merchant. Call this " +
    "whenever the customer asks when you open, close, or whether you're open on a given day -- " +
    "this is the only place that answer exists, so never guess it and never infer it from " +
    "appointment availability. Returns `days`, each with `dayOfWeek` (0 = Sunday), `opensAt` and " +
    "`closesAt` as HH:MM. A day missing from the list is a day the business is closed, and an " +
    "empty list means the business hasn't set its hours yet -- say \"Ainda não temos horários " +
    "definidos por aqui\" (in the customer's language), never that it is closed or never opens. These are opening hours, not free slots: a day being open says " +
    "nothing about whether a time is still bookable, which is what find_available_slots is for.\n\n" +
    "Pass `from` and `to` (YYYY-MM-DD, at most 31 days) to also get `dates`: for each date, " +
    "whether it's `open`, and if not, `reason` -- \"closed\" (nobody works that weekday) or " +
    "\"time_off\" (with the merchant's `timeOffReason`, which may be null). Use this as soon as the " +
    "customer asks about a specific day, before asking which service: a closed day is closed for " +
    "every service.\n\n" +
    "When the business has several professionals, pass `professionalId` to get that " +
    "professional's own working days, hours and time off (they can differ from the business's). " +
    "Without it, a date is open if anyone works it.\n\n" +
    "When the customer also gave a time, pass `time` (\"HH:MM\", business's local time) with " +
    "`from` set to that date: the result gets `atTime`, saying whether someone is booked at that " +
    "moment -- per professional (`professionals`: `name`, `free`, and when not free a `reason`: " +
    "\"busy\" with `freeFrom` (the time they're free again that day, or null), \"not_working\" or " +
    "\"time_off\"), or just `free`/`reason` for a single-professional business. `free: true` " +
    "means nobody is booked at that moment, not that any service fits: a longer service can still " +
    "run into a later booking, which find_available_slots confirms once the service is known.",
  parameters: {
    type: "object",
    properties: {
      professionalId: PROFESSIONAL_ID_PARAM,
      from: { type: "string", description: "Optional. First date to check, YYYY-MM-DD." },
      to: { type: "string", description: "Optional. Last date to check, YYYY-MM-DD (inclusive)." },
      time: {
        type: "string",
        description: "Optional, with `from`. A time the customer asked for on `from`'s date, HH:MM.",
      },
    },
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as { professionalId?: unknown; from?: unknown; to?: unknown; time?: unknown };
    const professionalId = professionalIdArg(args.professionalId);
    const [rows, professionals] = await Promise.all([
      loadAllHours(ctx.supabase, ctx.companyId),
      listProfessionals(ctx.supabase, ctx.companyId),
    ]);

    const chosen = professionalId ? professionals.find((p) => p.id === professionalId) : null;
    let windows: Omit<HoursRow, "professional_id">[];
    if (chosen) {
      windows = effectiveHours(chosen, rows);
    } else {
      windows = rows.filter((r) => r.professional_id === null);
      if (windows.length === 0) windows = professionals.flatMap((p) => effectiveHours(p, rows));
    }

    const seen = new Set<string>();
    const days = windows
      .filter((w) => {
        const key = `${w.day_of_week}|${w.start_time}|${w.end_time}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.day_of_week - b.day_of_week || String(a.start_time).localeCompare(String(b.start_time)));

    const result: {
      days: { dayOfWeek: number; opensAt: string; closesAt: string }[];
      dates?: DateStatus[];
      atTime?: Record<string, unknown>;
    } = {
      days: days.map((row) => ({
        dayOfWeek: row.day_of_week,
        // `time` comes back as HH:MM:SS; the seconds are noise to read aloud.
        opensAt: String(row.start_time).slice(0, 5),
        closesAt: String(row.end_time).slice(0, 5),
      })),
    };

    const from = typeof args.from === "string" && DATE_ONLY.test(args.from) ? args.from : null;
    const toRaw = typeof args.to === "string" && DATE_ONLY.test(args.to) ? args.to : from;
    if (!from || !toRaw || toRaw < from) return result;
    const to = toRaw > addDays(from, MAX_RANGE_DAYS - 1) ? addDays(from, MAX_RANGE_DAYS - 1) : toRaw;

    const { data: timeOffRows, error } = await ctx.supabase
      .from("company_time_off")
      .select("start_date, end_date, reason, professional_id")
      .eq("company_id", ctx.companyId)
      .gte("end_date", from)
      .lte("start_date", to);
    if (error) throw error;
    const timeOff = (timeOffRows ?? []) as {
      start_date: string;
      end_date: string;
      reason: string | null;
      professional_id: string | null;
    }[];

    // Who could be working: the chosen professional, or everyone.
    const considered = chosen ? [chosen] : professionals;
    const dates: DateStatus[] = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      // Parsed as UTC midnight purely to read the weekday off a plain date.
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const covering = (professional: string | null) =>
        timeOff.find(
          (t) =>
            t.start_date <= date &&
            t.end_date >= date &&
            (t.professional_id === null || t.professional_id === professional),
        );
      const worksThatWeekday = considered.filter((p) => effectiveHours(p, rows).some((h) => h.day_of_week === dow));
      if (worksThatWeekday.length === 0) {
        dates.push({ date, open: false, reason: "closed" });
        continue;
      }
      const available = worksThatWeekday.filter((p) => !covering(p.id));
      if (available.length > 0) {
        dates.push({ date, open: true });
      } else {
        dates.push({
          date,
          open: false,
          reason: "time_off",
          timeOffReason: covering(worksThatWeekday[0].id)?.reason ?? null,
        });
      }
    }
    result.dates = dates;

    const time = typeof args.time === "string" && TIME_HH_MM.test(args.time.trim()) ? args.time.trim() : null;
    if (time && considered.length > 0) {
      const { data: company } = await ctx.supabase
        .from("companies")
        .select("timezone")
        .eq("id", ctx.companyId)
        .maybeSingle();
      const tz = company?.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";
      const dayStart = zonedTimeToUtc(from, "00:00", tz).toISOString();
      const dayEnd = zonedTimeToUtc(addDays(from, 1), "00:00", tz).toISOString();
      const { data: bookingRows, error: bookingError } = await ctx.supabase
        .from("appointments")
        .select("starts_at, ends_at, professional_id")
        .eq("company_id", ctx.companyId)
        .not("status", "in", "(cancelled,no_show)")
        .lt("starts_at", dayEnd)
        .gt("ends_at", dayStart);
      if (bookingError) throw bookingError;
      const bookings = (bookingRows ?? []) as { starts_at: string; ends_at: string; professional_id: string }[];

      const at = minutesOfDay(time);
      const dow = new Date(`${from}T00:00:00Z`).getUTCDay();
      // Clip each booking to this day, in local minutes.
      const toMinute = (instant: string, fallback: number) => {
        const local = localDateAndMinute(tz, instant);
        return local.date === from ? local.minute : fallback;
      };
      const statusOf = (professional: (typeof considered)[number]) =>
        describeStatus(
          statusAtMinute({
            at,
            windows: effectiveHours(professional, rows)
              .filter((h) => h.day_of_week === dow)
              .map((h) => [minutesOfDay(String(h.start_time)), minutesOfDay(String(h.end_time))] as const),
            busy: bookings
              .filter((b) => b.professional_id === professional.id)
              .map((b) => [toMinute(b.starts_at, 0), toMinute(b.ends_at, 24 * 60)] as const),
            timeOff: timeOff.some(
              (t) =>
                t.start_date <= from &&
                t.end_date >= from &&
                (t.professional_id === null || t.professional_id === professional.id),
            ),
          }),
        );

      result.atTime =
        professionals.length > 1
          ? {
              date: from,
              time,
              professionals: considered.map((p) => ({ id: p.id, name: p.name, ...statusOf(p) })),
            }
          : { date: from, time, ...statusOf(considered[0]) };
    }
    return result;
  },
};
