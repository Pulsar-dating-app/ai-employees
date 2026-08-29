// Trello I1 -- server-side half of connecting a company's Google Calendar.
// Structurally mirrors src/lib/whatsapp/meta-graph-api.ts: K2 (not built
// yet) will load Google Identity Services on the browser and trigger
// google.accounts.oauth2.initCodeClient({ ux_mode: 'popup' }), which hands
// the browser JS a short-lived authorization `code` directly -- no page
// redirect, no registered callback URL. That code gets POSTed to
// ../connect/route.ts, which calls exchangeCodeForToken below to do the
// actual server-to-server exchange.
//
// GOOGLE_OAUTH_TOKEN_URL lets tests point this at a local mock instead of
// the real Google endpoint (the spawned test Next.js server can't share an
// in-process fetch mock with the test runner -- see
// tests/integration/global-setup.ts), same reasoning as
// META_GRAPH_API_BASE_URL.
const GOOGLE_TOKEN_URL = process.env.GOOGLE_OAUTH_TOKEN_URL ?? "https://oauth2.googleapis.com/token";

export interface ExchangedGoogleTokens {
  accessToken: string;
  // Google only includes refresh_token in the token response on the very
  // first consent, or when the client passed prompt=consent (K2's trigger
  // always will) -- an ordinary reconnect can genuinely omit it. Callers
  // must retain the previously stored refresh_token when this is null, the
  // same way D1's connect route reuses an existing two_step_pin rather than
  // overwriting it with a fresh/empty one.
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  scope: string | null;
}

// redirect_uri: "postmessage" is not a real URL -- it's Google's documented
// required value for the JS popup code-client flow (ux_mode: 'popup'),
// which never does a real page redirect and so has no callback URL to
// register or match.
export async function exchangeCodeForToken(code: string): Promise<ExchangedGoogleTokens> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: "postmessage",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${await tokenRes.text()}`);

  const {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    scope,
  } = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!accessToken) throw new Error("Google token exchange returned no access_token");

  return {
    accessToken,
    refreshToken: refreshToken ?? null,
    tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    scope: scope ?? null,
  };
}

export interface RefreshedGoogleTokens {
  accessToken: string;
  tokenExpiresAt: string | null;
}

// Trello I2 -- the first real reader of a stored access_token needs this:
// Google's tokens are short-lived (~1hr), so a real freebusy call needs a
// refresh path to do anything useful at all. Unlike exchangeCodeForToken,
// Google's refresh response never includes a new refresh_token -- callers
// must keep using the one they already have stored.
export async function refreshAccessToken(refreshToken: string): Promise<RefreshedGoogleTokens> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token refresh failed: ${await tokenRes.text()}`);

  const { access_token: accessToken, expires_in: expiresIn } = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!accessToken) throw new Error("Google token refresh returned no access_token");

  return {
    accessToken,
    tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  };
}
