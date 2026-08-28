import type { PostgrestError } from "@supabase/supabase-js";
import { ProductRepository } from "@/lib/products/repository";
import { buildCheckoutUrl, generateTrackingId } from "@/lib/checkout/links";
import type { AgentTool, ToolExecutionContext } from "./types";

type CreateCheckoutLinkArgs = {
  productId: string;
};

export type CreateCheckoutLinkResult =
  | {
      available: true;
      checkoutUrl: string;
      trackingId: string;
      productId: string;
      productName: string;
    }
  | {
      available: false;
      reason: "product_not_found" | "product_has_no_url";
    };

// Postgres unique_violation -- the partial unique index on
// events.tracking_id (`where tracking_id is not null`).
const UNIQUE_VIOLATION = "23505";
const MAX_TRACKING_ID_ATTEMPTS = 3;

// Trello ticket C4 -- spec §14. Mints the trackable URL Malu sends a customer
// once they're ready to buy. The customer taps it in WhatsApp; E1 (not built
// yet) resolves it, records the real click, and redirects to the merchant's
// own product page. Sidde never processes the payment.
//
// The row written here is typed `product_recommendation`, NOT `checkout_click`
// -- deliberately correcting A1's original "how to apply" note. Spec §15
// defines a checkout_click as "when the customer clicks a tracked link", and
// the customer clicks minutes later or never; `events` is append-only (no
// update policy, by explicit decision), so E1 could never downgrade a
// mint-time click row afterwards. Recording the send here and the tap in E1
// keeps both numbers honest and gives E2 a real click-through rate. E1's click
// row carries this tracking id in `metadata` with its own `tracking_id` left
// null, so the partial unique index never collides. See decisions.md.
export const createCheckoutLinkTool: AgentTool = {
  name: "create_checkout_link",
  description:
    "Create a trackable link to a product's page, to send to a customer who is ready to buy. " +
    "Returns available: false when the product does not exist or has no page to link to -- " +
    "in that case tell the customer the link isn't available rather than inventing one.",
  parameters: {
    type: "object",
    properties: {
      productId: { type: "string", description: "Id of the product to link to." },
    },
    required: ["productId"],
    additionalProperties: false,
  },

  async execute(rawArgs, ctx): Promise<CreateCheckoutLinkResult> {
    const args = rawArgs as CreateCheckoutLinkArgs;

    // companyId always from ctx, never from model-supplied args (see
    // tools/types.ts). ProductRepository.get also enforces is_active, so a
    // delisted product can't be linked even by direct id.
    const product = await ProductRepository.get(ctx.companyId, args.productId, ctx.supabase);
    if (!product) return { available: false, reason: "product_not_found" };

    const destinationUrl = product.product_url?.trim();
    // The merchant simply hasn't filled this product's URL in. Returned as a
    // result rather than thrown: a throw would abort the whole turn, where
    // this lets Malu honestly say the link isn't available (spec §6 -- never
    // pretend certainty when the information isn't on file).
    if (!destinationUrl) return { available: false, reason: "product_has_no_url" };

    const trackingId = await insertRecommendationEvent(ctx, product.id, destinationUrl);

    return {
      available: true,
      checkoutUrl: buildCheckoutUrl(trackingId),
      trackingId,
      productId: product.id,
      productName: product.name,
    };
  },
};

// Retries on the (vanishingly unlikely, 64-bit) tracking-id collision rather
// than surfacing a raw Postgres error mid-conversation.
async function insertRecommendationEvent(
  ctx: ToolExecutionContext,
  productId: string,
  destinationUrl: string,
): Promise<string> {
  let lastError: PostgrestError | null = null;

  for (let attempt = 0; attempt < MAX_TRACKING_ID_ATTEMPTS; attempt++) {
    const trackingId = generateTrackingId();
    const { error } = await ctx.supabase.from("events").insert({
      company_id: ctx.companyId,
      agent_id: ctx.agentId,
      conversation_id: ctx.conversationId,
      customer_id: ctx.customerId,
      product_id: productId,
      type: "product_recommendation",
      tracking_id: trackingId,
      metadata: { destination_url: destinationUrl },
    });

    if (!error) return trackingId;
    if (error.code !== UNIQUE_VIOLATION) throw error;
    lastError = error;
  }

  throw lastError;
}
