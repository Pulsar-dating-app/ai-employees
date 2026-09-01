import { AppointmentRepository } from "@/lib/appointments/repository";
import type { AgentTool } from "./types";

type FindAvailableSlotsArgs = {
  serviceId: string;
  from: string;
  to: string;
};

// Trello J3, tool #2 -- the real "keep track of available times" capability
// (I2's availability engine, called in-process the same way search_products
// calls ProductRepository). companyId always from ctx. The engine intersects
// business_hours, our own appointments, and the connected Google Calendar's
// free/busy; a Google outage degrades to the first two with
// googleCalendarChecked:false rather than failing.
export const findAvailableSlotsTool: AgentTool = {
  name: "find_available_slots",
  description:
    "Find real bookable time slots for one service between two dates. `serviceId` must come " +
    "from a list_services result. `from` and `to` are calendar dates (YYYY-MM-DD, `to` " +
    "inclusive) -- keep the range narrow, a few days at a time; ask the customer roughly when " +
    "they'd like to come in rather than scanning weeks at once.\n\n" +
    "Each slot's `start`/`end` are UTC ISO 8601 instants; the result also includes the " +
    "business's `timezone` -- always tell the customer times in that timezone, never raw UTC. " +
    "If `truncated` is true there were more slots than shown, so narrow the range or ask the " +
    "customer's preference. If `googleCalendarChecked` is false the business's live calendar " +
    "couldn't be consulted: still offer the slots, but don't promise the time is definitely " +
    "free.\n\n" +
    "`timeOff` lists date ranges (`start`/`end`, inclusive `YYYY-MM-DD`) the business has " +
    "blocked off within the window you asked about. If it's non-empty -- especially when " +
    "`slots` is empty because of it -- tell the customer the business is closed/away on those " +
    "dates rather than a bare \"nothing's available\": name the dates, and if a range has a " +
    "`reason` you may share it naturally (e.g. \"they're on holiday until the 15th\"); if " +
    "`reason` is null just say they're closed then. Then offer to look at a date after the " +
    "block ends.\n\n" +
    "If the list is empty and there's no `timeOff` explaining it, say nothing is open in that " +
    "range and offer to try another -- never invent a slot that isn't in the result. " +
    "`available: false` means that service isn't something this business offers.\n\n" +
    "`intakeQuestions` lists customer details this business wants before a booking (each with a " +
    "`label` and whether it's `required`). If it's non-empty, collect those from the customer -- " +
    "phrase each `label` as a natural question in your own words -- and pass the answers to " +
    "book_appointment as `intakeAnswers`. You must have every required one before booking; ask " +
    "for an optional one once and move on if they'd rather not say.",
  parameters: {
    type: "object",
    properties: {
      serviceId: {
        type: "string",
        description: "Id of the service to check, from a list_services result.",
      },
      from: { type: "string", description: "First date to check, YYYY-MM-DD." },
      to: { type: "string", description: "Last date to check, YYYY-MM-DD (inclusive)." },
    },
    required: ["serviceId", "from", "to"],
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as FindAvailableSlotsArgs;
    return AppointmentRepository.findAvailableSlots(
      { companyId: ctx.companyId, serviceId: args.serviceId, from: args.from, to: args.to },
      ctx.supabase,
    );
  },
};
