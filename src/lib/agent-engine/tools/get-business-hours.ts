import type { AgentTool } from "./types";
import { addDays } from "@/lib/analytics/load";
import { effectiveHours, type HoursRow } from "@/lib/professionals/rules";
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
// Read-only and company-scoped from ctx, like every other tool here.
const MAX_RANGE_DAYS = 31;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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
    "Without it, a date is open if anyone works it.",
  parameters: {
    type: "object",
    properties: {
      professionalId: PROFESSIONAL_ID_PARAM,
      from: { type: "string", description: "Optional. First date to check, YYYY-MM-DD." },
      to: { type: "string", description: "Optional. Last date to check, YYYY-MM-DD (inclusive)." },
    },
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as { professionalId?: unknown; from?: unknown; to?: unknown };
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

    const result: { days: { dayOfWeek: number; opensAt: string; closesAt: string }[]; dates?: DateStatus[] } = {
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
    return result;
  },
};
