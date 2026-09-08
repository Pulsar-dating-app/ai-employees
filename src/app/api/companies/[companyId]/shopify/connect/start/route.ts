import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl, normalizeShopDomain } from "@/lib/shopify/admin-api";
import { encodeState, generateNonce, SHOPIFY_OAUTH_STATE_COOKIE } from "@/lib/shopify/oauth-state";
import { requireAdmin } from "../../access";

// The merchant-facing entry point into Shopify OAuth: the connect card
// submits a plain GET form (shop domain in `?shop=`) straight here -- a
// real full-page redirect to Shopify, no client JS. Same shape as the
// Instagram connect/start route.
//
// GET (navigable by a form submit / link). Admin-gated: starting a flow
// that can overwrite the company's Shopify connection is not something a
// read-only member should trigger.
export async function GET(
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

  const rawShop = new URL(request.url).searchParams.get("shop");
  const shop = normalizeShopDomain(rawShop);
  if (!shop) {
    return NextResponse.json(
      { error: "Enter your store address, e.g. your-store.myshopify.com" },
      { status: 400 },
    );
  }

  const nonce = generateNonce();
  const state = encodeState({ companyId, shop, nonce });

  const response = NextResponse.redirect(buildAuthorizeUrl(shop, state), { status: 302 });

  // sameSite: "lax" (not "strict") is load-bearing -- the browser lands
  // back on the callback via a top-level GET navigation FROM the shop's
  // myshopify.com domain, a cross-site request a "strict" cookie would not
  // be sent on, breaking the nonce check for every real user.
  response.cookies.set(SHOPIFY_OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
