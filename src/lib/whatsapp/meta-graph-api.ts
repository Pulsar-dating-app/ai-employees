// Shared Meta Graph API calls for Trello D1's WhatsApp connect flow.
// Extracted once a second caller needed the same register/subscribe/lookup
// sequence (the real connect route, and the temporary manual-connect-test
// route -- see src/app/api/companies/[companyId]/whatsapp/manual-connect-test/).
// This file itself is NOT test-only -- it's used by the real connect route
// and stays after F4 ships; only manual-connect-test (one of its two
// callers, tagged TODO(D1-TEST-ONLY)) goes away.
//
// META_GRAPH_API_BASE_URL lets tests point this at a local mock instead of
// the real Meta Graph API (the spawned test Next.js server can't share an
// in-process fetch mock with the test runner -- see tests/integration/global-setup.ts).
const GRAPH_API_BASE_URL = process.env.META_GRAPH_API_BASE_URL ?? "https://graph.facebook.com";
const GRAPH_API_VERSION = "v21.0";

function graphApiUrl(path: string, params?: Record<string, string>) {
  const url = new URL(`${GRAPH_API_BASE_URL}/${GRAPH_API_VERSION}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Meta ties a phone number to a two-step-verification PIN on its first
// /register call -- every subsequent /register for that same number
// (reconnect, retry) must supply the *same* PIN, or Meta rejects it with
// "(#133005) Two step verification PIN Mismatch". Callers must persist
// whatever PIN they pass to finishConnection (company_whatsapp_connections.two_step_pin)
// and reuse it on every future call for that company -- only generate a
// fresh one via this function when no stored PIN exists yet.
export function generateRegistrationPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function exchangeCodeForToken(code: string) {
  const tokenRes = await fetch(
    graphApiUrl("/oauth/access_token", {
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      code,
    }),
  );
  if (!tokenRes.ok) throw new Error(`Meta token exchange failed: ${await tokenRes.text()}`);
  const { access_token: accessToken, expires_in: expiresIn } = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!accessToken) throw new Error("Meta token exchange returned no access_token");

  return {
    accessToken,
    // Meta doesn't renew this automatically -- expires_in (seconds) at
    // least lets us record when it goes stale. No auto-refresh yet (needs a
    // scheduled job this codebase doesn't have any precedent for, and
    // nothing reads this token yet -- see decisions.md).
    tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  };
}

// Registers the phone number for Cloud API messaging, subscribes our app to
// the WABA's webhooks (so D2's inbound webhook has something to receive),
// and fetches the merchant-facing display number. Takes an already-valid
// access token -- callers get one either via exchangeCodeForToken (real
// Embedded Signup) or by pasting one from Meta's own API Setup test number
// (manual-connect-test, no Embedded Signup/Advanced Access needed). `pin`
// must be the previously-stored PIN for this connection if one exists (see
// generateRegistrationPin's doc comment) -- the caller decides that, not
// this function.
export async function finishConnection(
  accessToken: string,
  phoneNumberId: string,
  wabaId: string,
  pin: string,
) {
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const registerRes = await fetch(graphApiUrl(`/${phoneNumberId}/register`), {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  if (!registerRes.ok) {
    throw new Error(`Meta phone number registration failed: ${await registerRes.text()}`);
  }

  const subscribeRes = await fetch(graphApiUrl(`/${wabaId}/subscribed_apps`), {
    method: "POST",
    headers: authHeaders,
  });
  if (!subscribeRes.ok) throw new Error(`Meta webhook subscription failed: ${await subscribeRes.text()}`);

  const phoneRes = await fetch(
    graphApiUrl(`/${phoneNumberId}`, { fields: "display_phone_number" }),
    { headers: authHeaders },
  );
  if (!phoneRes.ok) throw new Error(`Meta phone number lookup failed: ${await phoneRes.text()}`);
  const { display_phone_number: displayPhoneNumber } = (await phoneRes.json()) as {
    display_phone_number?: string;
  };

  return { displayPhoneNumber: displayPhoneNumber ?? null };
}
