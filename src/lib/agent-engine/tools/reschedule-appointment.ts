import { AppointmentRepository } from "@/lib/appointments/repository";
import type { AgentTool } from "./types";

type RescheduleAppointmentArgs = {
  appointmentId: string;
  newStartsAt: string;
};

// Trello J6 -- move an existing appointment to a new time in one step,
// instead of the old "cancel then book again" (which briefly freed the slot
// for someone else and could strand the customer if the re-book failed).
// Scoped in the repository to this customer's own bookings, same as
// cancel_appointment.
export const rescheduleAppointmentTool: AgentTool = {
  name: "reschedule_appointment",
  description:
    "Move one of this customer's appointments to a new time. `appointmentId` must be one you " +
    "saw in a `list_my_appointments` or `book_appointment` result earlier in this conversation " +
    "-- don't guess. `newStartsAt` is the exact new start as an ISO 8601 instant with offset " +
    "(e.g. 2026-09-10T15:00:00-03:00) and must be one of the slot starts from a fresh " +
    "`find_available_slots` call for that service -- never a time you chose yourself.\n\n" +
    "The service (and so the duration) stays the same; only the time changes. On success, " +
    "`rescheduled` is true with the new `startsAt`/`endsAt` and the `timezone` to phrase them " +
    "in. If `rescheduled` is false, use `reason` to respond honestly and offer another time " +
    "(or a human handoff): \"not_found\" = you don't have a valid id for this customer's " +
    "booking; \"slot_unavailable\" = that new time was just taken; \"outside_business_hours\" " +
    "= the business is closed/away then; \"too_soon\" = the new time is sooner than the " +
    "business allows a booking to be made; \"not_reschedulable\" = the appointment is already " +
    "cancelled or completed. Never tell the customer it moved when it didn't.",
  parameters: {
    type: "object",
    properties: {
      appointmentId: {
        type: "string",
        description:
          "Id of the appointment to move, from a list_my_appointments or book_appointment result.",
      },
      newStartsAt: {
        type: "string",
        description:
          "New start time as an ISO 8601 instant with offset. Must match a slot start from a fresh find_available_slots call.",
      },
    },
    required: ["appointmentId", "newStartsAt"],
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as RescheduleAppointmentArgs;
    return AppointmentRepository.reschedule(
      {
        companyId: ctx.companyId,
        appointmentId: args.appointmentId,
        customerId: ctx.customerId,
        newStartsAt: args.newStartsAt,
      },
      ctx.supabase,
    );
  },
};
