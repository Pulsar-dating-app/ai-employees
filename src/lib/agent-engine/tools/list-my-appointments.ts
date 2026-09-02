import { AppointmentRepository } from "@/lib/appointments/repository";
import type { AgentTool } from "./types";

type ListMyAppointmentsArgs = {
  email?: string;
};

// Trello J5 -- Ana can see the customer's own upcoming appointments, so
// "what time is my appointment?", "did my booking go through?", and
// cancelling/rescheduling a booking made in an *earlier* conversation all
// work instead of falling straight to request_human.
//
// Identity: always the trusted ctx.customerId (covers Instagram, and web
// chat on the same browser). `email` is an optional widen -- if the
// customer says the address they booked with, appointments under any
// customer row with that email are included. Unverified, so it's read-only:
// cancel_appointment / reschedule_appointment stay scoped to ctx.customerId
// and won't act on an appointment surfaced only via the email path.
export const listMyAppointmentsTool: AgentTool = {
  name: "list_my_appointments",
  description:
    "List this customer's own upcoming appointments -- service name, `startsAtLabel` / " +
    "`endsAtLabel` (the time already written out in the business's timezone -- say these, " +
    "translated as needed; `startsAt`/`endsAt` are raw UTC ISO instants, don't recompute from " +
    "them), status, and the appointment `id` used by cancel_appointment / " +
    "reschedule_appointment. Call this when the customer asks about an existing booking (\"what time is mine?\", " +
    "\"did it go through?\", \"I need to move/cancel my appointment\") -- especially if it was " +
    "made earlier and you don't have its id in view.\n\n" +
    "By default it finds appointments tied to this conversation's customer. If that returns " +
    "nothing and the customer booked from another device or a while ago, ask for the email " +
    "they used and pass it as `email` -- that widens the search. An empty list means nothing " +
    "upcoming was found; offer to connect them with the team rather than guessing.\n\n" +
    "Note: an appointment found only via `email` can be shown but NOT cancelled or " +
    "rescheduled here (those need the booking to belong to this conversation) -- offer a " +
    "human handoff for changes in that case.",
  parameters: {
    type: "object",
    properties: {
      email: {
        type: "string",
        description:
          "Optional. The email address the customer says they booked with, to find " +
          "appointments made from another device or session.",
      },
    },
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as ListMyAppointmentsArgs;
    const appointments = await AppointmentRepository.listMyAppointments(
      {
        companyId: ctx.companyId,
        customerId: ctx.customerId,
        email: typeof args.email === "string" ? args.email : null,
      },
      ctx.supabase,
    );
    return { appointments };
  },
};
