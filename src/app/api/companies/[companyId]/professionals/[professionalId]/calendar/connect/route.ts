import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exchangeCodeForToken } from "@/lib/google-calendar/oauth";
import { requireProfessionalAccess } from "@/lib/professionals/route-auth";

// Trello I1, per professional since 2026-09-24 -- finishes what Google
// Identity Services' popup code client starts: the dashboard triggers
// google.accounts.oauth2.initCodeClient({ ux_mode: 'popup' }) and posts the
// short-lived { code } here. Each professional connects their own Google
// account (a clinic partner uses theirs; a barbershop owner can connect
// their own account for each barber and pick a different calendar for each
// -- see ../calendars). Allowed for company admins and for the team member
// linked to this professional.
const SAFE_COLUMNS = "provider, google_calendar_id, status, scopes, connected_at, token_expires_at";

// Google's alias for "the account's default calendar". The merchant can
// switch to another calendar of the same account afterwards.
const DEFAULT_GOOGLE_CALENDAR_ID = "primary";

// POST: Body { code }. Upserts on professional_id, so reconnecting is
// idempotent. Goes through the service client: access_token/refresh_token
// are column-privilege-locked for regular clients (migration 20260829201627).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; professionalId: string }> },
) {
  const { companyId, professionalId } = await params;
  const access = await requireProfessionalAccess(companyId, professionalId, "manage");
  if (access.error) return access.error;

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  // Wraps the whole body, not just the Google call: createServiceClient()
  // and its Supabase calls can throw too, and an uncaught throw would be a
  // bare, unlogged 500 -- see the 2026-08-29 decisions.md entry.
  try {
    const serviceClient = createServiceClient();

    // Google only returns refresh_token on the very first consent (or a
    // reconnect that forced prompt=consent) -- an ordinary reconnect can
    // omit it, so the stored one is reused rather than overwritten with
    // null. The chosen calendar is kept across reconnects too.
    const { data: existing } = await serviceClient
      .from("company_calendar_connections")
      .select("refresh_token, google_calendar_id")
      .eq("professional_id", professionalId)
      .maybeSingle();

    let accessToken: string;
    let refreshToken: string | null;
    let tokenExpiresAt: string | null;
    let scope: string | null;
    try {
      ({ accessToken, refreshToken, tokenExpiresAt, scope } = await exchangeCodeForToken(code));
    } catch (err) {
      // Never leak Google's raw error text to the merchant-facing UI.
      console.error("Google Calendar token exchange failed", err);
      return NextResponse.json({ error: "Failed to connect Google Calendar" }, { status: 502 });
    }

    // A reconnect with a different Google account gets a fresh token but
    // would keep pointing at a calendar id from the old account -- only keep
    // the stored calendar when the refresh token didn't change hands.
    const sameAccount = !refreshToken || refreshToken === existing?.refresh_token;
    const { data: connection, error } = await serviceClient
      .from("company_calendar_connections")
      .upsert(
        {
          company_id: companyId,
          professional_id: professionalId,
          provider: "google",
          google_calendar_id:
            sameAccount && existing?.google_calendar_id ? existing.google_calendar_id : DEFAULT_GOOGLE_CALENDAR_ID,
          status: "connected",
          access_token: accessToken,
          refresh_token: refreshToken ?? existing?.refresh_token ?? null,
          token_expires_at: tokenExpiresAt,
          scopes: scope,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "professional_id" },
      )
      .select(SAFE_COLUMNS)
      .single();

    if (error) {
      console.error("Failed to persist Google Calendar connection", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ connection });
  } catch (err) {
    console.error("Unexpected error connecting Google Calendar", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to connect Google Calendar" },
      { status: 500 },
    );
  }
}
