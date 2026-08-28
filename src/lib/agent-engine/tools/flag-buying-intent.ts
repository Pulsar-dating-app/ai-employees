import { ProductRepository } from "@/lib/products/repository";
import type { AgentTool } from "./types";

type FlagBuyingIntentArgs = {
  productId?: string;
};

export type FlagBuyingIntentResult = { recorded: true };

// Trello ticket C6 -- spec §15's "Buying Intent" metric. Fired the moment
// the customer signals they're ready/wanting to buy ("I'll take it", "how
// do I pay?", "send me the link", "quero esse", ...). E2 aggregates these
// rows; a buying_intent event is NEVER a sale and nothing may present it
// as one.
//
// Built as a model-callable tool rather than a separate keyword/regex
// classification pass, deliberately: a purchase signal is phrased
// completely differently in every language ("quero comprar", "me manda o
// link", "lo quiero", "I'll take it"), and a keyword pass would only ever
// catch whichever language its list happened to be written in. The model
// already recognizes intent in whatever language the customer is writing,
// and a tool call drops straight into C1's existing tool-execution loop
// with no extra round trip -- the same reasoning the C3 grounding tools
// used over hand-rolled logic. See decisions.md.
//
// The row is typed exactly `buying_intent` -- what actually happened at
// that moment -- per the 2026-08-28 decisions.md note that the event
// enum's values are observations, not funnel-stage intentions. No
// `tracking_id` (that's checkout-link only) and no dedup: a customer can
// legitimately signal intent more than once in a conversation, and E2
// counts occurrences.
export const flagBuyingIntentTool: AgentTool = {
  name: "flag_buying_intent",
  description:
    "Silently record that the customer has just shown a clear intent to buy -- e.g. \"I'll take " +
    "it\", \"how do I pay?\", \"send me the link\", \"I want this one\", or the equivalent in ANY " +
    "language (\"quero esse\", \"me manda o link\", \"lo quiero\"). Call this as soon as you see " +
    "such a signal, on top of whatever you reply to the customer. Do NOT call it for browsing or " +
    "merely-curious language (\"that looks nice\", \"maybe later\", \"how much is it?\", \"do you " +
    "have it in blue?\") -- only a clear, present intent to purchase. This is internal tracking " +
    "only: never mention it to the customer, and it does not mean a sale has happened. If a " +
    "specific product is what they want, pass its productId.",
  parameters: {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description:
          "Id of the specific product the customer wants to buy, if one is clearly in context " +
          "(e.g. from an earlier search result in this conversation). Omit if the intent isn't " +
          "tied to a specific product yet.",
      },
    },
    additionalProperties: false,
  },

  async execute(rawArgs, ctx): Promise<FlagBuyingIntentResult> {
    const args = rawArgs as FlagBuyingIntentArgs;

    // productId is the only model-controlled input. Validate it the same
    // way create_checkout_link does -- company-scoped + is_active via
    // ProductRepository.get -- and simply drop it if it doesn't resolve
    // rather than failing the turn: the buying-intent signal is real and
    // worth recording even when the product reference is stale, wrong, or
    // points at another tenant.
    let productId: string | null = null;
    if (typeof args.productId === "string" && args.productId.length > 0) {
      const product = await ProductRepository.get(ctx.companyId, args.productId, ctx.supabase);
      productId = product?.id ?? null;
    }

    // company/agent/conversation/customer always from ctx, never from
    // model-supplied args (see tools/types.ts).
    const { error } = await ctx.supabase.from("events").insert({
      company_id: ctx.companyId,
      agent_id: ctx.agentId,
      conversation_id: ctx.conversationId,
      customer_id: ctx.customerId,
      product_id: productId,
      type: "buying_intent",
    });
    if (error) throw error;

    return { recorded: true };
  },
};
