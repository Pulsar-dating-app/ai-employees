import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Trello ticket I1 -- Google Calendar connection status/lifecycle. The
// actual "connect" action lives in ./connect/route.ts (it needs the Google
// OAuth token exchange); this file is the simpler read/disconnect pair.
// Structurally a copy of D1's whatsapp/route.ts.
//
// company_calendar_connections.access_token/refresh_token are
// column-privilege-locked (migration 20260829201627) -- every select below
// lists safe columns explicitly and must never include either.
const SAFE_COLUMNS = "provider, google_calendar_id, status, scopes, connected_at, token_expires_at";

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

// GET: any company member can see connection status -- the
// access_token/refresh_token columns are never selected here.
export async function GET(
  _request: Request,
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

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const { data, error } = await supabase
    .from("company_calendar_connections")
    .select(SAFE_COLUMNS)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("Failed to read Google Calendar connection status", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection: data ?? null });
}

// DELETE: admin-only disconnect. Flips status and clears both tokens
// (nullable) rather than deleting the row, so the last-connected calendar id
// stays visible -- a no-op (200, connection: null) if nothing was ever
// connected, matching D1. Goes straight through the service client:
// access_token/refresh_token are column-privilege-locked for the regular
// admin client, so nulling them out requires bypassing that grant.
export async function DELETE(
  _request: Request,
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

  // See connect/route.ts's matching comment -- createServiceClient() throws
  // synchronously on a missing env var, so this must be caught explicitly or
  // it becomes a bare, unlogged 500.
  try {
    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("company_calendar_connections")
      .update({ status: "disconnected", access_token: null, refresh_token: null, token_expires_at: null })
      .eq("company_id", companyId)
      .select(SAFE_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error("Failed to disconnect Google Calendar", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ connection: data ?? null });
  } catch (err) {
    console.error("Unexpected error disconnecting Google Calendar", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disconnect Google Calendar" },
      { status: 500 },
    );
  }
}
