import type { AgentTool } from "./types";

export type RequestHumanResult = { recorded: true };

// Trello ticket C5. Deliberately minimal per the card's own scope: a flag,
// not a live handoff system -- no notification, no takeover UI, no
// assignment logic. F5 (not built yet) will surface conversations in this
// state by reading `status`; that's a separate ticket.
//
// Reuses `conversations.status = 'paused'` rather than adding a dedicated
// `needs_human` boolean -- the column already allows this value
// (`check (status in ('active', 'closed', 'paused'))`), nothing else in
// the codebase currently writes 'paused' to *this* table (only
// `company_agents.status`, a different column entirely, uses that value --
// no collision), and this was already anticipated when the 24h
// conversation-rotation logic was built: see the 2026-08-27 decisions.md
// entry noting `status` is never blindly reset to 'active' on an
// unrelated activity-timestamp bump, specifically so a future
// paused/needs-human conversation can't be silently reactivated. See the
// 2026-08-28 decisions.md entry for the full "status vs. new column"
// reasoning this ticket resolved.
//
// Known caveat, not fixed here (out of scope -- D2/D3 own conversation
// routing, not this tool): `dev-chat-test`'s own 24h reuse query only
// looks up `status = 'active'` conversations, so the customer's next
// message in that *test* tool would silently start a new conversation
// rather than staying paused. Real production routing doesn't exist yet
// (D2 isn't built), so this doesn't apply to the real product today.
export const requestHumanTool: AgentTool = {
  name: "request_human",
  description:
    "Flag this conversation for a human team member to take over -- for something you " +
    "genuinely can't resolve even with your tools (a complaint that needs a real person, a " +
    "request outside what you can do, something you don't have on file after actually " +
    "checking). Before calling this, make sure you've actually tried the tools available to " +
    "you (search_products, get_business_information, get_policy_information) -- don't hand " +
    "off just because an answer isn't immediately obvious. After calling this, still reply to " +
    "the customer yourself, in your own natural voice, letting them know someone will follow " +
    "up -- never mention this as a technical action, just say what a real employee would " +
    "(e.g. \"Deixa que eu chamo alguém do time pra te ajudar com isso 😊\").",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },

  async execute(_rawArgs, ctx): Promise<RequestHumanResult> {
    // company_id double-checked alongside id, same defense-in-depth as
    // every other data-access tool here (B5's own precedent) -- even
    // though ctx.conversationId is already validated against
    // ctx.companyId earlier in the pipeline (loadConversation), never
    // trust a single id alone for a write.
    const { error } = await ctx.supabase
      .from("conversations")
      .update({ status: "paused" })
      .eq("id", ctx.conversationId)
      .eq("company_id", ctx.companyId);
    if (error) throw error;

    return { recorded: true };
  },
};
