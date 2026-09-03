import { AppointmentRepository } from "@/lib/appointments/repository";
import type { AgentTool } from "./types";

// Trello J3, tool #1 -- the scheduling analog of search_products: the
// deterministic read that grounds Ana in what the business actually offers,
// so she never guesses a service, its length, or its price. companyId always
// from ctx (see search-products.ts for why), never from model args. Added as
// a fourth scheduling tool beyond the card's named three because
// find_available_slots/book_appointment both need a real service id and
// nothing else exposes the catalogue to the model -- resolving a service by
// name inside those tools would reintroduce the exact string-guessing this
// codebase's grounding work keeps removing. See the 2026-08-30 decisions.md
// entry.
export const listServicesTool: AgentTool = {
  name: "list_services",
  description:
    "List what a customer can book here. `services` is the real list -- each one's name, what " +
    "it involves, how long it takes (in minutes), and its price. Call this before offering to " +
    "check availability or book anything, so you work from the real list instead of guessing. " +
    "Use the exact `id` from a result when calling find_available_slots or book_appointment. " +
    "An empty `services` list means the business hasn't set up any bookable services yet.\n\n" +
    "`defaultService` (may be null): a catch-all the business turned on for requests it didn't " +
    "list as their own service. When the customer wants something that isn't in `services` but " +
    "plausibly fits what this business does (check get_business_information to know what kind of " +
    "business it is -- e.g. a dental clinic covers a toothache, a cleaning, a check-up; it does " +
    "not cover haircuts or ordering food), book it under `defaultService.id` and put what they " +
    "actually asked for in book_appointment's `summary`, then tell them plainly what you booked. " +
    "If `defaultService` is null, only the listed services can be booked -- say the thing they " +
    "asked for isn't something you can book and offer the ones that are. Either way, if a " +
    "request is strange or clearly outside this business's line of work, don't force it into the " +
    "default -- ask a question to understand what they need, and offer a human if it's genuinely " +
    "unrelated.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async execute(_rawArgs, ctx) {
    return AppointmentRepository.listServices(ctx.companyId, ctx.supabase);
  },
};
