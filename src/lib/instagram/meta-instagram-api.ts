import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";

// Shared Meta calls for Trello N2's Instagram connect flow. A sibling of
// src/lib/whatsapp/meta-graph-api.ts, not a parameter on it -- Instagram's
// Business Login flow hits different hosts (api.instagram.com for the code
// exchange, graph.instagram.com for everything after) and a different
// token lifecycle (60-day long-lived tokens that can be refreshed, vs.
// WhatsApp's which this codebase never renews).
//
// INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET are NOT the same as
// META_APP_ID/META_APP_SECRET (the top-level Meta app credentials D1's
// WhatsApp Embedded Signup uses). Business Login for Instagram is issued
// its own separate credential pair, shown at App Dashboard > Instagram >
// API setup with Instagram login > 3. Set up Instagram business login >
// Business login settings -- sending the top-level Meta App ID as
// client_id here gets rejected with "Invalid platform app" (found live,
// 2026-08-31). The webhook's X-Hub-Signature-256 (webhook-signature.ts) is
// also signed with INSTAGRAM_APP_SECRET, not META_APP_SECRET -- Instagram
// API with Instagram Login signs its own webhooks with its own app secret
// (found live 2026-09-02; the classic Graph API / WhatsApp webhooks are
// the ones that use META_APP_SECRET).
//
// One more id gotcha in the same family: the `user_id` the OAuth code
// exchange returns is *app-scoped* and does NOT match the id on inbound
// messaging webhooks or the Send API path. connectInstagramAccount stores
// the professional-account id from GET /me?fields=user_id instead -- see
// fetchAccountProfile (found live 2026-09-02: every real DM missed N4's
// connection lookup).
//
// INSTAGRAM_API_BASE_URL/INSTAGRAM_GRAPH_BASE_URL let tests point this at a
// local mock instead of the real endpoints -- same reasoning as
// META_GRAPH_API_BASE_URL: the spawned test Next.js server can't share an
// in-process fetch mock with the test runner (see tests/integration/global-setup.ts).
const API_BASE_URL = process.env.INSTAGRAM_API_BASE_URL ?? "https://api.instagram.com";
const GRAPH_BASE_URL = process.env.INSTAGRAM_GRAPH_BASE_URL ?? "https://graph.instagram.com";
const GRAPH_API_VERSION = "v25.0";

// Trello N3 -- one shared callback for every agent's connect flow (the
// merchant clicks "Connect Instagram" on Ana's page or Malu's, but both
// land here; ./instagram/oauth-state.ts's `state` payload carries which
// agent). A single redirect URI means it only has to be registered once in
// the Meta App Dashboard, rather than re-registered for every agent slug a
// company hires.
//
// Reuses resolveCheckoutBaseUrl() rather than adding a third base-URL
// resolver -- same precedent M6 already established for exactly this
// ("this app's own base URL, server-only, throws in production if unset").
// Meta's Business Login rejects a plain http redirect URI outright, so
// local testing needs `npm run dev:https` AND STAFFRA_CHECKOUT_BASE_URL set
// to an https URL (see .env.example) -- otherwise this builds an http:// URL
// that will never match what's registered.
export function instagramCallbackUrl(): string {
  return `${resolveCheckoutBaseUrl()}/dashboard/my-agents/instagram-callback`;
}

function graphUrl(path: string, params?: Record<string, string>) {
  const url = new URL(`${GRAPH_BASE_URL}/${GRAPH_API_VERSION}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Step 1 of Business Login for Instagram: the authorize URL the merchant is
// redirected to (src/app/api/.../instagram/connect/start/route.ts builds
// the "Connect Instagram" link around this). redirect_uri is always
// instagramCallbackUrl() -- Meta requires it to exactly match what's
// registered in the App Dashboard, and with one shared callback there is
// only ever one correct value, so no caller has to supply or duplicate it.
export function buildAuthorizeUrl(state: string) {
  const url = new URL(`${API_BASE_URL}/oauth/authorize`);
  url.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!);
  url.searchParams.set("redirect_uri", instagramCallbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages");
  url.searchParams.set("state", state);
  return url.toString();
}

// Step 2: code -> short-lived (1h) token.
//
// The OAuth response also carries a `user_id`, but it is the *app-scoped*
// id -- it does NOT match the id Instagram stamps on messaging webhooks
// (`entry[].id` / `recipient.id`) nor the one the Send API addresses in its
// path. That id is the Instagram professional-account id, which only
// GET /me?fields=user_id returns (see fetchAccountProfile). Trusting the
// OAuth `user_id` here is what made every real inbound DM miss its
// connection lookup in N4's webhook (found live 2026-09-02), so it is
// deliberately ignored.
async function exchangeCodeForShortLivedToken(code: string) {
  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: instagramCallbackUrl(),
    code,
  });
  const res = await fetch(`${API_BASE_URL}/oauth/access_token`, { method: "POST", body });
  if (!res.ok) throw new Error(`Instagram code exchange failed: ${await res.text()}`);
  const { access_token: accessToken } = (await res.json()) as { access_token?: string };
  if (!accessToken) throw new Error("Instagram code exchange returned no access_token");
  return { accessToken };
}

// Step 3: short-lived -> long-lived (60 days). N6 is the future renewal job;
// this function just performs one exchange, on connect or on refresh alike.
async function exchangeForLongLivedToken(shortLivedToken: string) {
  const res = await fetch(
    graphUrl("/access_token", {
      grant_type: "ig_exchange_token",
      client_secret: process.env.INSTAGRAM_APP_SECRET!,
      access_token: shortLivedToken,
    }),
  );
  if (!res.ok) throw new Error(`Instagram long-lived token exchange failed: ${await res.text()}`);
  const { access_token: accessToken, expires_in: expiresIn } = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!accessToken) throw new Error("Instagram long-lived token exchange returned no access_token");

  return {
    accessToken,
    tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  };
}

// Refreshes an existing long-lived token before it goes stale. N6's job to
// call this on a schedule; exposed here since it's the same Graph endpoint
// family. Per Meta's docs the token must still be valid and at least 24h
// old -- this function doesn't enforce that, the caller (N6) decides when
// to call it.
export async function refreshLongLivedToken(accessToken: string) {
  const res = await fetch(graphUrl("/refresh_access_token", { grant_type: "ig_refresh_token", access_token: accessToken }));
  if (!res.ok) throw new Error(`Instagram token refresh failed: ${await res.text()}`);
  const { access_token: refreshed, expires_in: expiresIn } = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!refreshed) throw new Error("Instagram token refresh returned no access_token");

  return {
    accessToken: refreshed,
    tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  };
}

// Step 4, easy to miss (D1 had the same easily-missed step): without this
// per-account subscribe call the account never delivers webhooks, even
// though the app itself is subscribed at the platform level.
async function subscribeToMessaging(accessToken: string, instagramUserId: string) {
  const res = await fetch(
    graphUrl(`/${instagramUserId}/subscribed_apps`, { subscribed_fields: "messages" }),
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Instagram webhook subscription failed: ${await res.text()}`);
}

// The Instagram professional-account id plus the merchant-facing @username,
// in one call.
//
// `user_id` here -- NOT `id`, which is the same app-scoped value the OAuth
// exchange returns -- is the id that messaging webhooks arrive under
// (`entry[].id` / `recipient.id`) and that the Send API addresses in its
// path. It is what company_instagram_connections.instagram_user_id must
// hold for N4's inbound lookup (`.eq("instagram_user_id", recipientId)`) to
// find this connection. The username is only for N3's "Connected: @loja"
// card -- never surface the raw account id.
async function fetchAccountProfile(accessToken: string) {
  const res = await fetch(
    graphUrl("/me", { fields: "user_id,username" }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Instagram account lookup failed: ${await res.text()}`);
  const { user_id: userId, username } = (await res.json()) as {
    user_id?: string | number;
    username?: string;
  };
  if (userId === undefined) throw new Error("Instagram account lookup returned no user_id");
  return { instagramUserId: String(userId), username: username ?? null };
}

// The full connect sequence the route calls: code -> long-lived token,
// subscribed to webhooks, username resolved. Mirrors WhatsApp's
// exchangeCodeForToken + finishConnection pair, collapsed into one function
// since Instagram's steps have no independent reuse the way WhatsApp's
// manual-connect-test route needed (finishConnection alone, skipping the
// code exchange) -- nothing here has a second caller yet.
export async function connectInstagramAccount(code: string) {
  const { accessToken: shortLivedToken } = await exchangeCodeForShortLivedToken(code);
  const { accessToken, tokenExpiresAt } = await exchangeForLongLivedToken(shortLivedToken);
  // Resolve the professional-account id from the token itself, not the
  // OAuth response's app-scoped user_id -- see fetchAccountProfile.
  const { instagramUserId, username } = await fetchAccountProfile(accessToken);
  await subscribeToMessaging(accessToken, instagramUserId);

  return { instagramUserId, username, accessToken, tokenExpiresAt };
}

// Trello N5 -- delivery, the other end of N4's inbound webhook. `<IG_ID>` in
// the path is OUR business account (the sender, i.e. instagramUserId); the
// customer being replied to is `recipientId`, in the body. Text is capped
// at Instagram's own 2000-character limit -- hard-truncated rather than
// split across multiple messages, a deliberate simplification for a first
// version (Ana/Malu's replies are short conversational text; splitting a
// rare long one loses nothing today's ticket needs).
const MAX_MESSAGE_LENGTH = 2000;

export type SendInstagramMessageResult =
  | { ok: true }
  // tokenInvalid distinguishes "the token itself is dead" (401/403 -- N4's
  // caller should flip the connection so N3's card reflects reality) from
  // any other failure (network blip, Meta 5xx after the one retry already
  // failed -- transient, log and move on, the connection is still fine).
  | { ok: false; tokenInvalid: boolean };

// Trello N11 -- `humanAgentTag` sends the message under Instagram's
// `HUMAN_AGENT` tag (`messaging_type: "MESSAGE_TAG"`), the only way to
// reply past the 24h window: up to 7 days, and only for a genuine human
// reply. The default path (no options / tag false) is byte-for-byte
// unchanged -- the inbound webhook's automated replies must never use it.
export async function sendInstagramMessage(
  accessToken: string,
  instagramUserId: string,
  recipientId: string,
  text: string,
  options: { humanAgentTag?: boolean } = {},
): Promise<SendInstagramMessageResult> {
  const body = JSON.stringify({
    recipient: { id: recipientId },
    message: { text: text.slice(0, MAX_MESSAGE_LENGTH) },
    ...(options.humanAgentTag ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : {}),
  });

  const attempt = () =>
    fetch(graphUrl(`/${instagramUserId}/messages`), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body,
    });

  let res = await attempt();
  // Retry once on a transient failure only -- a 4xx (bad token, bad
  // recipient) will fail identically on retry, so don't waste the call.
  if (!res.ok && res.status >= 500) {
    res = await attempt();
  }

  if (res.ok) return { ok: true };
  return { ok: false, tokenInvalid: res.status === 401 || res.status === 403 };
}
