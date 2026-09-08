import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeState, SHOPIFY_OAUTH_STATE_COOKIE } from "@/lib/shopify/oauth-state";

// Where Shopify OAuth lands the merchant after they approve (or deny). One
// shared route for every company -- `state` carries which company started
// the flow (see src/lib/shopify/admin-api.ts's shopifyCallbackUrl doc).
// Same shape as the Instagram callback: read the query, do the CSRF nonce
// check, forward to the connect route, redirect back to the products page.
//
// Explicit 302 on every branch (route handlers default NextResponse.redirect
// to 307, meaningless for a GET redirect and inconsistent with connect/start).
function redirectTo(url: string | URL) {
  return NextResponse.redirect(url, 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawState = url.searchParams.get("state");
  const shopifyError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const storedNonce = cookieStore.get(SHOPIFY_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(SHOPIFY_OAUTH_STATE_COOKIE); // single-use regardless of outcome

  const state = rawState ? decodeState(rawState) : null;
  const productsUrl = new URL("/dashboard/products", url.origin);

  // No trustworthy state -> CSRF failure. Bounce to the products page with
  // a generic error rather than guessing.
  if (!state || !storedNonce || state.nonce !== storedNonce) {
    productsUrl.searchParams.set("shopify_error", "invalid_state");
    return redirectTo(productsUrl);
  }

  if (shopifyError) {
    productsUrl.searchParams.set("shopify_error", "denied");
    return redirectTo(productsUrl);
  }

  // Delegate to the connect route (forwarding the session cookie) so it can
  // run the admin re-check + HMAC verification for real. The whole callback
  // query string goes in the body -- the connect route rebuilds it to
  // verify Shopify's `hmac`.
  const connectResponse = await fetch(
    `${url.origin}/api/companies/${state.companyId}/shopify/connect`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ query: url.search }),
    },
  );

  if (connectResponse.ok) {
    productsUrl.searchParams.set("shopify", "connected");
    return redirectTo(productsUrl);
  }

  const body = await connectResponse.json().catch(() => null);
  const mapped =
    body?.error === "shop_connected_elsewhere"
      ? "connected_elsewhere"
      : body?.error === "invalid_hmac"
        ? "invalid_hmac"
        : connectResponse.status === 403
          ? "not_admin"
          : "connect_failed";
  productsUrl.searchParams.set("shopify_error", mapped);
  return redirectTo(productsUrl);
}
