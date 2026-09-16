import type { AgentTool } from "./types";
import { resolveToolsForAgent } from "./tool-sets";

// The first session's proof step is a rehearsal. Everything that READS stays
// real -- that is the entire point, she is working with the merchant's own
// catalogue, services, hours and availability, and the slots she offers are
// genuinely free ones. Everything that WRITES is replaced by a twin that
// returns the same success shape and does nothing, so she reports the booking
// in her own words while no row, no email and no calendar event is created.
//
// Swapped rather than removed, deliberately: a scheduling agent with no
// booking tool cannot finish the conversation it just started, and would
// either stall or tell the merchant it is unable to book -- which is a worse
// demonstration than no demonstration. She has to be able to say "done".
const REHEARSED: Record<string, unknown> = {
  book_appointment: { booked: true },
  cancel_appointment: { cancelled: true },
  reschedule_appointment: { rescheduled: true },
  add_to_waitlist: { added: true },
  flag_buying_intent: { recorded: true },
  request_human: { handoffRequested: true },
};

// create_checkout_link is its own case: the real tool mints a tracked
// /c/{id} redirect backed by an events row. A rehearsal must not create that
// row, and handing back a dead link would have the merchant click it and land
// on an error -- so it returns the product's own URL when there is one, and
// says plainly that there is none otherwise.
const CHECKOUT_TOOL = "create_checkout_link";

export function isRehearsalSafe(toolName: string): boolean {
  return !(toolName in REHEARSED) && toolName !== CHECKOUT_TOOL;
}

function rehearse(tool: AgentTool): AgentTool {
  if (isRehearsalSafe(tool.name)) return tool;

  return {
    ...tool,
    async execute(rawArgs, ctx) {
      if (tool.name === CHECKOUT_TOOL) {
        const args = rawArgs as { productId?: string };
        const { data } = await ctx.supabase
          .from("products")
          .select("product_url")
          .eq("company_id", ctx.companyId)
          .eq("id", args.productId ?? "")
          .maybeSingle();
        const url = (data as { product_url: string | null } | null)?.product_url ?? null;
        return url ? { url } : { error: "This product has no link yet." };
      }

      return REHEARSED[tool.name];
    },
  };
}

// The agent's real tool set, with every writer swapped. Resolved from the
// same place the production one is, so a tool added to an agent tomorrow is
// rehearsed tomorrow rather than silently writing during a demo.
export function resolveRehearsalToolsForAgent(slug: string): AgentTool[] {
  return resolveToolsForAgent(slug).map(rehearse);
}
