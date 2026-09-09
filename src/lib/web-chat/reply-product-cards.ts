import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCheckoutUrl } from "@/lib/checkout/links";
import { mintRecommendationTrackingId } from "@/lib/checkout/recommendation-events";
import { selectProductCards, type MessageMetadata, type ProductCard } from "@/lib/chat/product-cards";

// Builds the product cards attached to one web-chat reply: picks which of
// the turn's searched products to show (pure, in chat/product-cards.ts),
// then gives each a tappable tracked link.
//
// Web chat only, by decision (2026-09-09) -- WhatsApp and Instagram render
// no HTML, so cards there mean real outbound media messages, which is
// different work on a different budget. Nothing here is imported by those
// channels, and the agent prompt is untouched, so their replies are byte
// for byte what they were before.

type ToolCallLike = { name: string; args: Record<string, unknown>; result: unknown };

type BuildContext = {
  supabase: SupabaseClient;
  companyId: string;
  agentId: string;
  conversationId: string;
  customerId: string;
};

// A `create_checkout_link` result from the same turn. When the model
// already minted a link for a product, the card reuses that tracking id
// instead of minting a second one -- otherwise a single recommendation
// would write two `product_recommendation` rows and quietly double that
// product's count in the merchant's analytics.
function reuseExistingTrackingIds(toolCalls: readonly ToolCallLike[]): Map<string, string> {
  const byProductId = new Map<string, string>();

  for (const call of toolCalls) {
    if (call.name !== "create_checkout_link") continue;
    const result = call.result as Record<string, unknown> | null;
    if (!result || result.available !== true) continue;
    if (typeof result.productId === "string" && typeof result.trackingId === "string") {
      byProductId.set(result.productId, result.trackingId);
    }
  }

  return byProductId;
}

export async function buildReplyProductCards(
  ctx: BuildContext,
  toolCalls: readonly ToolCallLike[],
  responseText: string,
): Promise<MessageMetadata | null> {
  const selected = selectProductCards(toolCalls, responseText);
  if (selected.length === 0) return null;

  const existing = reuseExistingTrackingIds(toolCalls);

  const products: ProductCard[] = [];
  for (const product of selected) {
    const destinationUrl = product.product_url?.trim();
    let trackingId = destinationUrl ? existing.get(product.id) : undefined;

    if (destinationUrl && !trackingId) {
      try {
        trackingId = await mintRecommendationTrackingId(ctx, product.id, destinationUrl);
      } catch (error) {
        // A failed mint costs the card its link, not the customer their
        // reply. The text answer is already correct and the picture is
        // still worth showing -- silently dropping the whole card, or
        // failing the request, would both be worse than an untappable one.
        console.warn("[web-chat] could not mint a tracked link for a product card", {
          companyId: ctx.companyId,
          productId: product.id,
          error,
        });
      }
    }

    products.push({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      imageUrl: product.image_url,
      url: trackingId ? buildCheckoutUrl(trackingId) : null,
    });
  }

  return { products };
}
