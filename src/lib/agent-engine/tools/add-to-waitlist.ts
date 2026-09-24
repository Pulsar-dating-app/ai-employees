import { WaitlistRepository } from "@/lib/appointments/waitlist";
import type { AgentTool } from "./types";
import { effectiveHours, eligibleProfessionals } from "@/lib/professionals/rules";
import { linkedProfessionalIds, listProfessionals, loadAllHours } from "@/lib/professionals/repository";
import { PROFESSIONAL_ID_PARAM, professionalIdArg } from "./professional-param";

type AddToWaitlistArgs = {
  serviceId: string;
  from: string;
  to: string;
  email?: string;
  professionalId?: string;
};

// Trello R5 -- the waitlist. Ana offers this when find_available_slots came
// back empty for the customer's preferred window (nothing open, or the whole
// window is time off) and the customer wants to be told if something frees
// up. The customer, conversation and agent are attached from ctx. There is
// no auto-hold: a freed slot just triggers an email, first come first served.
export const addToWaitlistTool: AgentTool = {
  name: "add_to_waitlist",
  description:
    "Add this customer to the waitlist for a service over a date range, so they get an email " +
    "if an appointment is cancelled and a slot opens up in that window. Offer this only after " +
    "find_available_slots came back with nothing bookable for the range the customer wanted " +
    "and they've said they'd like to be notified.\n\n" +
    "`serviceId` comes from a list_services result. `from` and `to` are calendar dates " +
    "(YYYY-MM-DD, `to` inclusive) -- use the same window you just searched, or the narrower one " +
    "the customer actually cares about. The customer and this conversation are attached " +
    "automatically.\n\n" +
    "The waitlist needs an email to notify. Pass `email` if you've collected one this " +
    "conversation; otherwise the customer's existing email on file is used. If neither exists " +
    "the result is `{ added: false, reason: \"email_required\" }` -- ask the customer for their " +
    "email and call again with it. `reason: \"invalid_email\"` means the address was malformed; " +
    "`reason: \"service_not_found\"` means that service isn't offered; `reason: " +
    "\"invalid_range\"` means the dates were backwards or malformed.\n\n" +
    "On success `added` is true. `alreadyWaiting: true` means they were already on this exact " +
    "list -- reassure them they're still in line, don't add a duplicate. Tell the customer " +
    "plainly that the spot isn't held and it's first come, first served, and that you can't " +
    "promise anything will open up.\n\n" +
    "When the business has several professionals, pass the `professionalId` the customer is " +
    "waiting for, or leave it out if any professional would do.",
  parameters: {
    type: "object",
    properties: {
      serviceId: {
        type: "string",
        description: "Id of the service to wait for, from a list_services result.",
      },
      from: { type: "string", description: "First date of the desired window, YYYY-MM-DD." },
      to: { type: "string", description: "Last date of the desired window, YYYY-MM-DD (inclusive)." },
      email: {
        type: "string",
        description:
          "Optional. The customer's email, if you collected one this conversation. Omit to use " +
          "whatever is already on file.",
      },
      professionalId: PROFESSIONAL_ID_PARAM,
    },
    required: ["serviceId", "from", "to"],
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as AddToWaitlistArgs;

    // A waitlist promises "I'll tell you if something frees up", which is a
    // promise nobody can keep for a day the business never works. The tool
    // description says so, but a description is a suggestion and this is a
    // rule -- the same reasoning C7 used for putting grounding in code rather
    // than trusting the prompt alone.
    //
    // 2026-09-24 -- "works" means the chosen professional, or anyone who
    // performs the service when the customer has no preference.
    const professionalId = professionalIdArg(args.professionalId);
    const [active, linked, hoursRows] = await Promise.all([
      listProfessionals(ctx.supabase, ctx.companyId),
      linkedProfessionalIds(ctx.supabase, args.serviceId),
      loadAllHours(ctx.supabase, ctx.companyId),
    ]);
    const relevant = professionalId
      ? active.filter((p) => p.id === professionalId)
      : eligibleProfessionals(active, linked);

    // Only meaningful for a well-formed range: a backwards one iterates zero
    // times below and would be reported as "closed" instead of reaching the
    // repository's own `invalid_range`.
    const openWeekdays = new Set(relevant.flatMap((p) => effectiveHours(p, hoursRows).map((h) => h.day_of_week)));

    // No hours at all is "not set up yet", not "closed" -- but a waitlist for a
    // business with no bookable times is just as unkeepable a promise.
    if (openWeekdays.size === 0) {
      return {
        added: false,
        reason: "no_business_hours",
        message:
          "The business hasn't set its opening hours yet, so no time can ever open up. Tell the " +
          "customer \"Ainda não temos horários definidos por aqui\" (in their language) and offer " +
          "the team if you can. Do not offer a waitlist or other dates.",
      };
    }

    if (openWeekdays.size > 0 && args.from <= args.to) {
      let anyOpen = false;
      for (let date = args.from; date <= args.to; date = addDays(date, 1)) {
        if (openWeekdays.has(new Date(`${date}T00:00:00Z`).getUTCDay())) {
          anyOpen = true;
          break;
        }
      }
      if (!anyOpen) {
        return {
          added: false,
          reason: "closed",
          message:
            "The business does not open on any day in that range, so there is nothing to wait " +
            "for. Tell the customer which days it does open and offer one of those instead.",
        };
      }
    }

    return WaitlistRepository.addToWaitlist(
      {
        companyId: ctx.companyId,
        customerId: ctx.customerId,
        serviceId: args.serviceId,
        conversationId: ctx.conversationId,
        agentId: ctx.agentId,
        from: args.from,
        to: args.to,
        email: typeof args.email === "string" ? args.email : null,
        professionalId,
      },
      ctx.supabase,
    );
  },
};

function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
