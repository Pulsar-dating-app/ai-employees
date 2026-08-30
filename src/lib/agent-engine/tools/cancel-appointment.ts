import { AppointmentRepository } from "@/lib/appointments/repository";
import type { AgentTool } from "./types";

type CancelAppointmentArgs = {
  appointmentId: string;
  reason?: string;
};

// Trello J3, tool #4 -- soft-cancels an appointment (status -> 'cancelled',
// never a hard delete), scoped in the repository to this customer's own
// bookings so Ana can never cancel someone else's. `appointmentId` comes
// from a book_appointment result earlier in the conversation; there is
// deliberately no "list my appointments" tool for MVP, so a booking made in
// a much older conversation (outside the model's visible history) can't be
// cancelled here -- that falls to request_human. Reschedule is likewise not
// its own tool: cancel then book the new time, two steps.
export const cancelAppointmentTool: AgentTool = {
  name: "cancel_appointment",
  description:
    "Cancel an appointment this customer previously booked. `appointmentId` must be one you " +
    "saw in a book_appointment result earlier in this conversation -- don't guess an id. " +
    "`reason` is optional free text from the customer. Only this customer's own appointments " +
    "can be cancelled.\n\n" +
    "If `cancelled` is false with reason \"not_found\", you don't have a valid id for one of " +
    "their bookings (e.g. it was made another time and isn't in view) -- don't guess; offer to " +
    "connect them with the team instead. `alreadyCancelled: true` means it was already " +
    "cancelled, so just reassure them. To move an appointment to a new time, cancel it and " +
    "then book the new time as two separate steps.",
  parameters: {
    type: "object",
    properties: {
      appointmentId: {
        type: "string",
        description: "Id of the appointment to cancel, from a book_appointment result.",
      },
      reason: {
        type: "string",
        description: "Optional reason the customer gave for cancelling.",
      },
    },
    required: ["appointmentId"],
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as CancelAppointmentArgs;
    return AppointmentRepository.cancel(
      {
        companyId: ctx.companyId,
        appointmentId: args.appointmentId,
        customerId: ctx.customerId,
        reason: typeof args.reason === "string" ? args.reason : null,
      },
      ctx.supabase,
    );
  },
};
