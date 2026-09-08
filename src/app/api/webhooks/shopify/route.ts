import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhookHmac } from "@/lib/shopify/hmac";

// Public, unauthenticated. Excluded from src/proxy.ts's session matcher
// (`api/webhooks/` prefix). Handles:
//
//  * app/uninstalled  -> tear down the connection (token is dead anyway)
//  * shop/redact      -> same (we hold nothing else for that shop)
//  * customers/data_request, customers/redact -> we store no Shopify
//    customer PII, so acknowledge and do nothing.
//
// Always verifies the base64 HMAC over the RAW body first, and always
// returns 200 fast on the happy path (Shopify disables endpoints that error
// or are slow). The compliance topics are mandatory for the app to exist;
// their delivery is configured in the app's settings, this route is their
// endpoint.

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyWebhookHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"))) {
    return new NextResponse(null, { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shopDomain = request.headers.get("x-shopify-shop-domain") ?? "";

  if ((topic === "app/uninstalled" || topic === "shop/redact") && shopDomain) {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("company_shopify_connections")
      .update({ status: "disconnected", access_token: null, refresh_token: null, token_expires_at: null })
      .eq("shop_domain", shopDomain)
      .neq("status", "disconnected");
    if (error) {
      // Log, but still 200 -- Shopify will retry, and a persistent failure
      // here shouldn't get the endpoint disabled.
      console.error("Shopify webhook: failed to disconnect", topic, error);
    }
  }
  // customers/data_request and customers/redact: nothing to do -- Staffra
  // never ingests Shopify customer data. Acknowledged.

  return new NextResponse(null, { status: 200 });
}
