import { AppointmentRepository } from "@/lib/appointments/repository";
import type { AgentTool } from "./types";

type FindNextAvailableArgs = {
  serviceId: string;
};

// Trello J8 -- the "what's your soonest slot for X?" shortcut. find_available_slots
// answers the same question but makes Ana pick a date range and often call it
// more than once; this scans forward from now over the same I2 availability
// engine (business hours, our appointments, Google free/busy, merchant time
// off, J7's lead time) and returns the single earliest bookable slot. For a
// day or window the customer actually named, use find_available_slots.
export const findNextAvailableTool: AgentTool = {
  name: "find_next_available",
  description:
    "Get the single earliest bookable slot for one service, scanning forward from now. " +
    "`serviceId` must come from a list_services result. Use this when the customer asks for " +
    "your *soonest* opening (\"what's the earliest you have?\", \"anything today?\") rather than " +
    "a specific day -- for a named day or range use find_available_slots instead.\n\n" +
    "When `found` is true, `slot` has a `label` -- the time already written out in the " +
    "business's timezone (\"Wed, Sep 3, 14:40\"). Say that (translated into the customer's " +
    "language / clock style as needed); never compute a time yourself from `start`/`end`, " +
    "which are UTC ISO 8601 instants for passing back to book_appointment only. If " +
    "`googleCalendarChecked` is false the business's live calendar couldn't be consulted: " +
    "still offer the slot, but don't promise the time is definitely free.\n\n" +
    "`found: false` means nothing is open in roughly the next `horizonDays` days -- tell the " +
    "customer that and offer to check a specific later date with find_available_slots; never " +
    "invent a slot.\n\n" +
    "`intakeQuestions` works exactly as in find_available_slots: each has a `key` (key your " +
    "`intakeAnswers` object by this), a `label` (phrase the question from it, in your own " +
    "words), a `fieldType` (`email` / `phone` / `cpf` / `date` / `name` / `text`), and whether " +
    "it's `required`. An `email` is always present and always required. Collect every required " +
    "one before calling book_appointment.\n\n" +
    "`available: false` means that service isn't something this business offers.",
  parameters: {
    type: "object",
    properties: {
      serviceId: {
        type: "string",
        description: "Id of the service to check, from a list_services result.",
      },
    },
    required: ["serviceId"],
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as FindNextAvailableArgs;
    return AppointmentRepository.findNextAvailable(
      { companyId: ctx.companyId, serviceId: args.serviceId },
      ctx.supabase,
    );
  },
};
