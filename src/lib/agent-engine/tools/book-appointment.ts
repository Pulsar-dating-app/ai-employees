import { AppointmentRepository } from "@/lib/appointments/repository";
import { redactDefaultServiceName } from "./redact-default-service-name";
import type { AgentTool } from "./types";

type BookAppointmentArgs = {
  serviceId: string;
  startsAt: string;
  notes?: string;
  summary?: string;
  intakeAnswers?: Record<string, unknown>;
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
    "Book exactly ONE appointment per customer message. If the customer asks to book several " +
    "times, or every open slot, don't book them all: show the options and ask which single time " +
    "they want, then book just that one. " +
    "Businesses require customer details before a booking -- an email always, plus whatever " +
    "else they configured. `find_available_slots` returns them as `intakeQuestions`, each with " +
    "a `key`, a `label`, and a `fieldType` (email/phone/cpf/date/name/text). Ask in your own " +
    "words, then pass `intakeAnswers` keyed by each question's `key` (not its label). Have " +
    "every `required` one; ask an optional one once and leave it out if declined.\n\n" +
    "Always pass `summary`: two or three sentences, written for the practitioner who will see " +
    "this customer, recapping why they're booking -- their situation, symptoms, goal, or " +
    "request as it came up in the chat, plus anything the professional should know before the " +
    "appointment. Write it as a briefing in your own words, not a transcript and not a list of " +
    "the customer's quotes. If the customer gave nothing to summarise (just \"I want to book X\"), " +
    "pass a one-line note saying so.\n\n" +
    "On success, `status` is either \"confirmed\" (the booking is set) or \"requested\" (the " +
    "business needs to review and confirm it) -- tell the customer which one happened, in your " +
    "own natural words, and confirm the time using `startsAtLabel` (already in the business's " +
    "timezone -- don't recompute from the raw `startsAt`). If `serviceName` is absent, this was " +
    "booked under the business's general/default service: don't invent or ask for a service " +
    "name, just confirm the appointment by day and time (e.g. \"Agendamento confirmado: amanhã, " +
    "das 10h às 10h30\"). If `booked` is false, use `reason` to explain honestly (\"slot_unavailable\" " +
    "= someone just took that time, \"outside_business_hours\" = the business is closed then, " +
    "\"service_not_found\" = not something they offer, \"too_soon\" = the start is sooner than " +
    "the business accepts a booking (offer a later time), \"daily_limit_reached\" = this " +
    "customer already has the maximum number of appointments allowed on that day -- decline " +
    "warmly and offer to book on a different day instead, \"one_booking_per_message\" = a booking " +
    "was already made (or is being made) for this message -- confirm that one and ask whether " +
    "they want another, \"missing_intake_answers\" = the " +
    "business still needs the details listed in `missingRequired` -- ask for exactly those and " +
    "retry, \"invalid_intake_answers\" = a value was the wrong shape (`invalid` names which " +
    "label and why -- e.g. a bad email or a CPF that isn't 11 digits) -- ask again for those " +
    "and retry) and offer another time -- never tell the customer it's booked when it isn't.",
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
      summary: {
        type: "string",
        description:
          "A short professional-facing recap of what the appointment is about — the customer's " +
          "reason / situation in your own words, for the practitioner to read. Not a transcript.",
      },
      intakeAnswers: {
        type: "object",
        description:
          "The customer's answers, keyed by each question's `key` from find_available_slots' " +
          "`intakeQuestions` (e.g. {\"email\": \"ana@example.com\", \"full_name\": \"Ana Souza\", " +
          "\"cpf\": \"123.456.789-00\"}). Include every required question; omit an optional one " +
          "the customer didn't answer.",
        additionalProperties: { type: "string" },
      },
    },
    required: ["serviceId", "startsAt"],
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as BookAppointmentArgs;

    // One booking per customer message. Asked to "book every free slot", the
    // model emits several book_appointment calls in a single reply and the
    // tool loop runs them in parallel. The claim is taken synchronously,
    // before the first await, so exactly one of those calls proceeds and the
    // rest are refused. It's released when the booking doesn't go through,
    // so Ana can still try another slot in the same turn (e.g. after
    // slot_unavailable).
    const turn = ctx.turnState;
    if (turn?.bookingClaimed) return { booked: false, reason: "one_booking_per_message" };
    if (turn) turn.bookingClaimed = true;

    let result;
    try {
      result = await AppointmentRepository.book(
        {
          companyId: ctx.companyId,
          serviceId: args.serviceId,
          customerId: ctx.customerId,
          conversationId: ctx.conversationId,
          agentId: ctx.agentId,
          startsAt: args.startsAt,
          notes: typeof args.notes === "string" ? args.notes : null,
          summary: typeof args.summary === "string" ? args.summary : null,
          intakeAnswers:
            args.intakeAnswers && typeof args.intakeAnswers === "object" ? args.intakeAnswers : null,
        },
        ctx.supabase,
      );
    } catch (err) {
      if (turn) turn.bookingClaimed = false;
      throw err;
    }
    if (turn && !result.booked) turn.bookingClaimed = false;
    return redactDefaultServiceName(result);
  },
};
