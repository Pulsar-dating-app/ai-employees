import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exchangeCodeForToken } from "@/lib/google-calendar/oauth";

// Trello ticket I1 -- finishes what Google Identity Services' popup code
// client starts. K2's (not yet built) dashboard screen loads that SDK and
// triggers google.accounts.oauth2.initCodeClient({ ux_mode: 'popup' }); on
// success the browser gets a short-lived { code } and posts it here. This
// route does the server-to-server work: exchange the code for tokens and
// persist the result. Structurally a copy of D1's whatsapp/connect/route.ts.
const SAFE_COLUMNS = "provider, google_calendar_id, status, scopes, connected_at, token_expires_at";

// MVP: single calendar per company, no calendar-picker UI -- 'primary' is
// Google's real special calendar-id alias for "the account's default
// calendar", valid to use directly in Calendar API calls, not a placeholder.
const GOOGLE_CALENDAR_ID = "primary";

async function requireMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const { data: membership, error } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }), role: null };
  }

  if (!membership) {
    return {
      error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }),
      role: null,
    };
  }

  return { error: null, role: membership.role as string };
}

async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const membership = await requireMember(supabase, companyId, userId);
  if (membership.error) return membership;

  if (!["owner", "admin"].includes(membership.role!)) {
    return {
      error: NextResponse.json(
        { error: "Only company owners/admins can manage the calendar connection" },
        { status: 403 },
      ),
      role: membership.role,
    };
  }

  return membership;
}

// POST: admin-only. Body: { code } -- exactly what the popup code client
// hands the browser on success. Upserts on company_id, so reconnecting is
// idempotent -- same convention as B1/D1. Goes straight through the service
// client: access_token/refresh_token are column-privilege-locked for the
// regular admin client (migration 20260829201627), so writing them requires
// bypassing that grant.
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
  const code = typeof body?.code === "string" ? body.code : "";

  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  // Google only returns refresh_token on the very first consent (or a
  // reconnect that forced prompt=consent) -- an ordinary reconnect can
  // legitimately omit it, so the previously stored one must be reused
  // rather than overwritten with null. Same "read existing before writing"
  // shape as D1's two_step_pin reuse.
  const { data: existing } = await serviceClient
    .from("company_calendar_connections")
    .select("refresh_token")
    .eq("company_id", companyId)
    .maybeSingle();

  let accessToken: string;
  let refreshToken: string | null;
  let tokenExpiresAt: string | null;
  let scope: string | null;
  try {
    ({ accessToken, refreshToken, tokenExpiresAt, scope } = await exchangeCodeForToken(code));
  } catch {
    // Never leak Google's raw error text to the merchant-facing UI.
    return NextResponse.json({ error: "Failed to connect Google Calendar" }, { status: 502 });
  }

  const { data: connection, error } = await serviceClient
    .from("company_calendar_connections")
    .upsert(
      {
        company_id: companyId,
        provider: "google",
        google_calendar_id: GOOGLE_CALENDAR_ID,
        status: "connected",
        access_token: accessToken,
        refresh_token: refreshToken ?? existing?.refresh_token ?? null,
        token_expires_at: tokenExpiresAt,
        scopes: scope,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    )
    .select(SAFE_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection });
}
