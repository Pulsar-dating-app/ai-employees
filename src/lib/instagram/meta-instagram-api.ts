// Shared Meta calls for Trello N2's Instagram connect flow. A sibling of
// src/lib/whatsapp/meta-graph-api.ts, not a parameter on it -- Instagram's
// Business Login flow hits different hosts (api.instagram.com for the code
// exchange, graph.instagram.com for everything after) and a different
// token lifecycle (60-day long-lived tokens that can be refreshed, vs.
// WhatsApp's which this codebase never renews).
//
// INSTAGRAM_API_BASE_URL/INSTAGRAM_GRAPH_BASE_URL let tests point this at a
// local mock instead of the real endpoints -- same reasoning as
// META_GRAPH_API_BASE_URL: the spawned test Next.js server can't share an
// in-process fetch mock with the test runner (see tests/integration/global-setup.ts).
const API_BASE_URL = process.env.INSTAGRAM_API_BASE_URL ?? "https://api.instagram.com";
const GRAPH_BASE_URL = process.env.INSTAGRAM_GRAPH_BASE_URL ?? "https://graph.instagram.com";
const GRAPH_API_VERSION = "v25.0";

function graphUrl(path: string, params?: Record<string, string>) {
  const url = new URL(`${GRAPH_BASE_URL}/${GRAPH_API_VERSION}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Step 1 of Business Login for Instagram: the authorize URL the merchant is
// redirected to. N3 builds the "Connect Instagram" button around this.
export function buildAuthorizeUrl(redirectUri: string, state: string) {
  const url = new URL(`${API_BASE_URL}/oauth/authorize`);
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages");
  url.searchParams.set("state", state);
  return url.toString();
}

// Step 2: code -> short-lived (1h) token + the app-scoped Instagram user id.
async function exchangeCodeForShortLivedToken(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`${API_BASE_URL}/oauth/access_token`, { method: "POST", body });
  if (!res.ok) throw new Error(`Instagram code exchange failed: ${await res.text()}`);
  const { access_token: accessToken, user_id: userId } = (await res.json()) as {
    access_token?: string;
    user_id?: string | number;
  };
  if (!accessToken || userId === undefined) {
    throw new Error("Instagram code exchange returned no access_token/user_id");
  }
  return { accessToken, userId: String(userId) };
}

// Step 3: short-lived -> long-lived (60 days). N6 is the future renewal job;
// this function just performs one exchange, on connect or on refresh alike.
async function exchangeForLongLivedToken(shortLivedToken: string) {
  const res = await fetch(
    graphUrl("/access_token", {
      grant_type: "ig_exchange_token",
      client_secret: process.env.META_APP_SECRET!,
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

// The merchant-facing @username, so N3 can show "Connected: @loja" the way
// the WhatsApp card shows a phone number -- never the raw account id.
async function fetchUsername(accessToken: string, instagramUserId: string) {
  const res = await fetch(
    graphUrl(`/${instagramUserId}`, { fields: "username" }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Instagram account lookup failed: ${await res.text()}`);
  const { username } = (await res.json()) as { username?: string };
  return username ?? null;
}

// The full connect sequence the route calls: code -> long-lived token,
// subscribed to webhooks, username resolved. Mirrors WhatsApp's
// exchangeCodeForToken + finishConnection pair, collapsed into one function
// since Instagram's steps have no independent reuse the way WhatsApp's
// manual-connect-test route needed (finishConnection alone, skipping the
// code exchange) -- nothing here has a second caller yet.
export async function connectInstagramAccount(code: string, redirectUri: string) {
  const { accessToken: shortLivedToken, userId } = await exchangeCodeForShortLivedToken(code, redirectUri);
  const { accessToken, tokenExpiresAt } = await exchangeForLongLivedToken(shortLivedToken);
  await subscribeToMessaging(accessToken, userId);
  const username = await fetchUsername(accessToken, userId);

  return { instagramUserId: userId, username, accessToken, tokenExpiresAt };
}
