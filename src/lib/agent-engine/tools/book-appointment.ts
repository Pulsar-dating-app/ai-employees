import { AppointmentRepository } from "@/lib/appointments/repository";
import type { AgentTool } from "./types";

type BookAppointmentArgs = {
  serviceId: string;
  startsAt: string;
  notes?: string;
};

// Trello J3, tool #3 -- writes the appointments row. The customer, this
// conversation, and the agent are all attached from ctx, never from model
// args (same trust rule as create_checkout_link). ends_at and status are
// decided server-side in the repository exactly as the H3 POST route does --
// the model can't self-approve a booking or set its own end time. A failed
// booking comes back as `booked: false` with a `reason` rather than throwing,
// so Ana can respond honestly instead of the turn aborting.
export const bookAppointmentTool: AgentTool = {
  name: "book_appointment",
  description:
    "Book an appointment for this customer. `serviceId` comes from list_services; `startsAt` " +
    "is the exact start time as an ISO 8601 instant with an offset (e.g. " +
    "2026-09-01T14:00:00-03:00) and must be one of the slot starts returned by " +
    "find_available_slots -- never a time you chose yourself. The customer, this conversation, " +
    "and you are attached automatically; don't ask the customer for ids.\n\n" +
    "On success, `status` is either \"confirmed\" (the booking is set) or \"requested\" (the " +
    "business needs to review and confirm it) -- tell the customer which one happened, in your " +
    "own natural words. If `booked` is false, use `reason` to explain honestly (\"slot_unavailable\" " +
    "= someone just took that time, \"outside_business_hours\" = the business is closed then, " +
    "\"service_not_found\" = not something they offer) and offer to find another time -- never " +
    "tell the customer it's booked when it isn't.",
  parameters: {
    type: "object",
    properties: {
      serviceId: {
        type: "string",
        description: "Id of the service being booked, from a list_services result.",
      },
      startsAt: {
        type: "string",
        description:
          "Start time as an ISO 8601 instant with offset. Must match a slot start from find_available_slots.",
      },
      notes: {
        type: "string",
        description: "Optional short note from the customer about this booking.",
      },
    },
    required: ["serviceId", "startsAt"],
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as BookAppointmentArgs;
    return AppointmentRepository.book(
      {
        companyId: ctx.companyId,
        serviceId: args.serviceId,
        customerId: ctx.customerId,
        conversationId: ctx.conversationId,
        agentId: ctx.agentId,
        startsAt: args.startsAt,
        notes: typeof args.notes === "string" ? args.notes : null,
      },
      ctx.supabase,
    );
  },
};
