import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  exchangeCodeForToken,
  fetchShopInfo,
  normalizeShopDomain,
  registerAppUninstalledWebhook,
} from "@/lib/shopify/admin-api";
import { verifyOAuthCallbackHmac } from "@/lib/shopify/hmac";
import { requireAdmin, SHOPIFY_CONNECTION_SAFE_COLUMNS } from "../access";

// Finishes what ./connect/start began: the shopify-callback route forwards
// the OAuth redirect's raw query string here (with the session cookie) so
// this route owns HMAC verification, the admin re-check, the code→token
// exchange, and persistence. Structural copy of the calendar connect route.
//
// POST body: { query: "<raw callback query string>" }.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const adminCheck = await requireAdmin(supabase, companyId, user.id);
  if (adminCheck.error) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const rawQuery = typeof body?.query === "string" ? body.query : "";
  const callbackParams = new URLSearchParams(rawQuery.replace(/^\?/, ""));

  // Verify Shopify's signature over the callback params BEFORE trusting any
  // of them -- this is what proves the redirect really came from Shopify.
  if (!verifyOAuthCallbackHmac(callbackParams)) {
    return NextResponse.json({ error: "invalid_hmac" }, { status: 401 });
  }

  const shop = normalizeShopDomain(callbackParams.get("shop"));
  if (!shop) {
    return NextResponse.json({ error: "invalid_shop" }, { status: 400 });
  }

  const code = callbackParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  try {
    const serviceClient = createServiceClient();

    // A store belongs to exactly one company (partial unique index on
    // shop_domain). Surface a live holder under a different company as an
    // actionable 409 rather than a raw 23505 -- and never auto-resolve it.
    const { data: holder } = await serviceClient
      .from("company_shopify_connections")
      .select("company_id")
      .eq("shop_domain", shop)
      .neq("status", "disconnected")
      .maybeSingle();
    if (holder && holder.company_id !== companyId) {
      return NextResponse.json({ error: "shop_connected_elsewhere" }, { status: 409 });
    }

    let accessToken: string;
    let scope: string;
    try {
      ({ accessToken, scope } = await exchangeCodeForToken(shop, code));
    } catch (err) {
      // Never leak Shopify's raw error text to the merchant-facing UI; log
      // the real cause (bad secret, code already used/expired, redirect_uri
      // mismatch) server-side.
      console.error("Shopify token exchange failed", err);
      return NextResponse.json({ error: "connect_failed" }, { status: 502 });
    }

    // Shop name/currency are for display + the row's default currency; a
    // failure here shouldn't fail the whole connect (the sync re-reads
    // currency each run anyway).
    let shopName: string | null = null;
    let currency: string | null = null;
    try {
      ({ name: shopName, currency } = await fetchShopInfo(shop, accessToken));
    } catch (err) {
      console.error("Shopify shop info lookup failed (continuing)", err);
    }

    // Best-effort: keep going if it's already registered or Shopify rejects
    // the callback URL (local dev over http).
    try {
      await registerAppUninstalledWebhook(shop, accessToken);
    } catch (err) {
      console.error("Shopify app/uninstalled webhook registration failed (continuing)", err);
    }

    const { data: connection, error } = await serviceClient
      .from("company_shopify_connections")
      .upsert(
        {
          company_id: companyId,
          shop_domain: shop,
          shop_name: shopName,
          currency,
          scope,
          status: "connected",
          access_token: accessToken,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      )
      .select(SHOPIFY_CONNECTION_SAFE_COLUMNS)
      .single();

    if (error) {
      console.error("Failed to persist Shopify connection", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ connection });
  } catch (err) {
    console.error("Unexpected error connecting Shopify", err);
    return NextResponse.json({ error: "connect_failed" }, { status: 500 });
  }
}
