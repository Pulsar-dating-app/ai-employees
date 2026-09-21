import { AppointmentRepository } from "@/lib/appointments/repository";
import { omitCalendarSignal } from "./omit-calendar-signal";
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
    "Each slot has a `label` -- the time already written out in the business's timezone " +
    "(\"Wed, Sep 3, 14:40\"). Say that to the customer (translated into their language / clock " +
    "style as needed); never compute a time yourself from the raw `start`/`end`, which are UTC " +
    "ISO 8601 instants for passing back to book_appointment only. The result also includes the " +
    "business's `timezone` for reference. " +
    "If `truncated` is true there were more slots than shown, so narrow the range or ask the " +
    "customer's preference. Every slot listed is genuinely free: offer it plainly and confirm " +
    "it without hedging -- never say you can't guarantee it, that it may change, or that it " +
    "still needs to be validated, and never mention calendars or how availability is " +
    "computed.\n\n" +
    "`timeOff` lists date ranges (`start`/`end`, inclusive `YYYY-MM-DD`) the business has " +
    "blocked off within the window you asked about. If it's non-empty -- especially when " +
    "`slots` is empty because of it -- tell the customer the business is closed/away on those " +
    "dates rather than a bare \"nothing's available\": name the dates, and if a range has a " +
    "`reason` you may share it naturally (e.g. \"they're on holiday until the 15th\"); if " +
    "`reason` is null just say they're closed then. Then offer to look at a date after the " +
    "block ends.\n\n" +
    "`closedDates` lists dates in the window the business simply does not open on -- a weekday " +
    "it never works, not a one-off block. If the customer asked about one of these, say the " +
    "business does not open that day (name the day) rather than \"nothing is available\", and " +
    "never offer the waitlist for it: no slot can free up on a day nobody works. Offer the " +
    "nearest day that is open instead.\n\n" +
    "If the list is empty and there's no `timeOff` or `closedDates` explaining it, say nothing " +
    "is open in that range and offer to try another -- never invent a slot that isn't in the " +
    "result. " +
    "`available: false` with `reason: \"service_not_found\"` means that service isn't something " +
    "this business offers. With `reason: \"no_business_hours\"` the business hasn't set its opening " +
    "hours yet, so there is nothing to offer for any date: tell the customer \"Ainda não temos " +
    "horários definidos por aqui\" (in their language) and offer the team if you can -- never say " +
    "the business is closed, never suggest other dates or the waitlist.\n\n" +
    "`intakeQuestions` lists customer details this business wants before a booking. Each has a " +
    "`key` (an id -- key your `intakeAnswers` object by this), a `label` (phrase the question " +
    "from this, in your own words), a `fieldType` (`email` / `phone` / `cpf` / `date` / `name` " +
    "/ `text` -- so you know what to expect), and whether it's `required`. An `email` is always " +
    "on the list and always required. Collect every required one before booking; ask for an " +
    "optional one once and move on if they'd rather not say. Pass what you gather to " +
    "book_appointment as `intakeAnswers`, keyed by each question's `key`.",
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
    const result = await AppointmentRepository.findAvailableSlots(
      { companyId: ctx.companyId, serviceId: args.serviceId, from: args.from, to: args.to },
      ctx.supabase,
    );
    return omitCalendarSignal(result);
  },
};
