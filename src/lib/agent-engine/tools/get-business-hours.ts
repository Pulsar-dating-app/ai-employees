import type { AgentTool } from "./types";

// "What time do you open?" is one of the most common things anyone asks a
// business, and until now no tool could answer it: get_business_information
// reads `companies` (name, contact, address, industry) and the opening hours
// live in their own table, reachable only through find_available_slots --
// which answers "when can I book", a different question. So a scheduling
// agent whose merchant had just configured opening hours would say she had
// none on file. Honest, per her grounding rules, and wrong.
//
// Read-only and company-scoped from ctx, like every other tool here.
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
    "nothing about whether a time is still bookable, which is what find_available_slots is for.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async execute(_rawArgs, ctx) {
    const { data, error } = await ctx.supabase
      .from("business_hours")
      .select("day_of_week, start_time, end_time")
      .eq("company_id", ctx.companyId)
      .eq("is_active", true)
      .order("day_of_week", { ascending: true });

    if (error) throw error;

    return {
      days: (data ?? []).map((row) => ({
        dayOfWeek: row.day_of_week as number,
        // `time` comes back as HH:MM:SS; the seconds are noise to read aloud.
        opensAt: String(row.start_time).slice(0, 5),
        closesAt: String(row.end_time).slice(0, 5),
      })),
    };
  },
};
