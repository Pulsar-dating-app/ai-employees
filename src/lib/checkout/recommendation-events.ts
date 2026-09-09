import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { generateTrackingId } from "./links";

// The `product_recommendation` event that mints a tracking id, extracted
// from the create_checkout_link tool (Trello C4) when web-chat product
// cards became a second caller. Both mint the same row for the same reason
// -- a product was put in front of a customer with a tappable link -- so
// they must not drift into two subtly different event shapes.
//
// Typed `product_recommendation`, never `checkout_click`: the customer taps
// minutes later or never, and `events` is append-only, so E1's redirect
// records the tap as its own row. See create-checkout-link.ts's comment and
// the C4 decisions.md entry for the full reasoning.

// Postgres unique_violation -- the partial unique index on
// events.tracking_id (`where tracking_id is not null`).
const UNIQUE_VIOLATION = "23505";
const MAX_TRACKING_ID_ATTEMPTS = 3;

export type RecommendationEventContext = {
  supabase: SupabaseClient;
  companyId: string;
  agentId: string | null;
  conversationId: string | null;
  customerId: string | null;
};

// Retries on the (vanishingly unlikely, 64-bit) tracking-id collision
// rather than surfacing a raw Postgres error mid-conversation.
export async function mintRecommendationTrackingId(
  ctx: RecommendationEventContext,
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
