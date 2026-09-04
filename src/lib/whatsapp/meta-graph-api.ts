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

// Meta's error envelope, `{ error: { code, error_subcode, message,
// fbtrace_id } }`. Nothing in this codebase parses it today -- every
// existing call here just stringifies the raw response body into an
// Error -- but D4/D5 need to branch on a specific code (131042, "Business
// Eligibility Payment Issue"), not just "the call failed". Returns null on
// any body that isn't Meta's documented shape, so a caller can fall back to
// its own generic handling rather than assume a code that isn't there.
export type GraphApiError = { code: number; message: string; errorSubcode?: number };

export async function parseGraphApiError(res: Response): Promise<GraphApiError | null> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const error = (body as { error?: unknown })?.error;
  if (!error || typeof error !== "object" || typeof (error as { code?: unknown }).code !== "number") {
    return null;
  }
  const { code, message, error_subcode: errorSubcode } = error as {
    code: number;
    message?: string;
    error_subcode?: number;
  };
  return { code, message: message ?? "Unknown Graph API error", errorSubcode };
}

// Trello D5 -- Meta's documented code for "Business Eligibility Payment
// Issue": no valid payment method on the WABA, applied account-wide, and
// returned on every send attempt (including free service-window replies)
// until it's fixed. See decisions.md / the D5 ticket for the research this
// is based on.
export const PAYMENT_ISSUE_ERROR_CODE = 131042;

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

// Trello D4 -- delivery, the other end of D2's inbound webhook. Modeled
// directly on sendInstagramMessage (src/lib/instagram/meta-instagram-api.ts):
// one retry on a transient 5xx, no retry on a 4xx (fails identically). The
// third outcome, `payment_issue`, is WhatsApp-specific -- D5's whole reason
// to exist -- and is not retried either: retrying a 131042 send just burns
// another call for the same account-level cause.
export type SendWhatsappMessageResult =
  | { ok: true }
  // token_invalid: the token itself is dead (401/403) -- the caller should
  // flip the connection to disconnected, same as Instagram's dead-token
  // handling.
  // payment_issue: Meta's 131042 -- the caller should set D5's
  // has_payment_issue flag, not retry.
  // other: anything else (network blip, a 4xx that isn't one of the above,
  // a 5xx that failed both attempts) -- log and move on.
  | { ok: false; kind: "token_invalid" | "payment_issue" | "other" };

export async function sendWhatsappMessage(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  text: string,
): Promise<SendWhatsappMessageResult> {
  const body = JSON.stringify({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });

  const attempt = () =>
    fetch(graphApiUrl(`/${phoneNumberId}/messages`), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body,
    });

  let res = await attempt();
  // Retry once on a transient failure only -- a 4xx (bad token, payment
  // issue, invalid recipient) will fail identically on retry.
  if (!res.ok && res.status >= 500) {
    res = await attempt();
  }

  if (res.ok) return { ok: true };

  const parsedError = await parseGraphApiError(res.clone());
  if (parsedError?.code === PAYMENT_ISSUE_ERROR_CODE) {
    return { ok: false, kind: "payment_issue" };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, kind: "token_invalid" };
  }
  return { ok: false, kind: "other" };
}

// Trello D5 -- a lightweight, non-sending probe used by the periodic
// eligibility recheck (see src/app/api/cron/whatsapp/recheck-eligibility).
// Reuses the same harmless phone-number lookup finishConnection already
// makes. This can only prove the WABA is reachable and the token still
// works -- it does NOT prove a real send would succeed, since Meta has no
// single confirmed "billing eligibility" field to poll (see decisions.md /
// the D5 ticket's own research note). The reliable signal stays
// sendWhatsappMessage's opportunistic `payment_issue` result; this is a
// best-effort supplement, not a source of truth.
export async function checkWhatsappEligibility(
  accessToken: string,
  phoneNumberId: string,
): Promise<{ ok: true } | { ok: false; stillHasPaymentIssue: boolean }> {
  const res = await fetch(graphApiUrl(`/${phoneNumberId}`, { fields: "display_phone_number" }), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return { ok: true };

  const parsedError = await parseGraphApiError(res.clone());
  return { ok: false, stillHasPaymentIssue: parsedError?.code === PAYMENT_ISSUE_ERROR_CODE };
}
