import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OAUTH_STATE_COOKIE, decodeState } from "@/lib/instagram/oauth-state";

// Trello N3 -- where Business Login for Instagram lands the merchant after
// they approve (or deny) the connection. One shared route for every agent
// (see meta-instagram-api.ts's instagramCallbackUrl doc comment); `state`
// carries which (company, agent) started this attempt.
//
// This is a route handler, not a page, because its whole job is "read the
// query string, do one server-to-server call, redirect" -- there is
// nothing here for a merchant to look at.
//
// Explicit 302 on every branch: NextResponse.redirect() defaults to 307 in
// a route handler, which is meaningless here (nothing about a temporary
// redirect off a GET needs to preserve method/body) but inconsistent with
// ./connect/start/route.ts's redirect, which does specify 302.
function redirectTo(url: string | URL) {
  return NextResponse.redirect(url, 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");
  const authorizationError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const storedNonce = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE); // single-use, regardless of outcome

  const state = rawState ? decodeState(rawState) : null;

  // No trustworthy agentSlug to send the merchant back to without a valid,
  // nonce-matched state -- this is the CSRF check. Falls back to the My
  // Team list rather than guessing an agent.
  if (!state || !storedNonce || state.nonce !== storedNonce) {
    return redirectTo(new URL("/dashboard/my-agents?instagram_error=invalid_state", url.origin));
  }

  const returnUrl = new URL(`/dashboard/my-agents/${state.agentSlug}`, url.origin);

  if (authorizationError) {
    // The merchant declined, or Instagram itself rejected the request --
    // either way, nothing to connect. Instagram's own error_reason/
    // error_description aren't surfaced verbatim (product-language rule,
    // spec §4/§28): the connect card just shows "didn't connect, try again".
    returnUrl.searchParams.set("instagram_error", "denied");
    return redirectTo(returnUrl);
  }

  if (!code) {
    returnUrl.searchParams.set("instagram_error", "missing_code");
    return redirectTo(returnUrl);
  }

  // Delegates to N2's connect route rather than calling
  // connectInstagramAccount directly -- that route already owns admin
  // re-verification and the account-uniqueness conflict handling; forwarding
  // the incoming session cookie lets it run those checks for real instead of
  // duplicating them here.
  //
  // force: true unconditionally: an Instagram authorization code is
  // single-use and expires in an hour, so there is no way to burn it on a
  // first (no-force) attempt, show the merchant a "this account is already
  // connected to Ana" confirmation, and then retry -- the code would
  // already be gone. Moving the account is safe to do without that extra
  // confirmation step because it only ever happens within the SAME
  // company (the connect route still hard-blocks a different company's
  // account regardless of force) -- an admin who can already connect and
  // disconnect every one of their own hires' channels isn't crossing any
  // access boundary by having one connect action move an account between
  // two of them in a single step.
  const connectResponse = await fetch(
    `${url.origin}/api/companies/${state.companyId}/agents/${state.agentSlug}/instagram/connect`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ code, force: true }),
    },
  );

  if (connectResponse.ok) {
    returnUrl.searchParams.set("instagram", "connected");
    return redirectTo(returnUrl);
  }

  const body = await connectResponse.json().catch(() => null);
  returnUrl.searchParams.set(
    "instagram_error",
    body?.error === "instagram_account_connected_elsewhere" ? "connected_elsewhere" : "connect_failed",
  );
  return redirectTo(returnUrl);
}
