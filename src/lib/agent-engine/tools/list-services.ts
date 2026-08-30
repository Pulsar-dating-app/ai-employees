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
    "List the services this business offers that a customer can book -- each one's name, what " +
    "it involves, how long it takes (in minutes), and its price. Call this before offering to " +
    "check availability or book anything, so you work from the real list instead of guessing " +
    "what's on offer. Use the exact `id` from a result when calling find_available_slots or " +
    "book_appointment. An empty list means the business hasn't set up any bookable services yet.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async execute(_rawArgs, ctx) {
    return AppointmentRepository.listServices(ctx.companyId, ctx.supabase);
  },
};
