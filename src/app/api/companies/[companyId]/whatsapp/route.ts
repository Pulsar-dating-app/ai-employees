import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Trello ticket D1 -- WhatsApp connection status/lifecycle. The actual
// "connect" action lives in ./connect/route.ts (it needs the Meta Graph API
// round trip); this file is the simpler read/disconnect pair.
//
// company_whatsapp_connections.access_token is column-privilege-locked
// (migration 20260826104820) -- every select below lists safe columns
// explicitly and must never include it for a regular (non-service) client.
const SAFE_COLUMNS =
  "phone_number_id, waba_id, display_phone_number, status, connected_at, token_expires_at";

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
        { error: "Only company owners/admins can manage the WhatsApp connection" },
        { status: 403 },
      ),
      role: membership.role,
    };
  }

  return membership;
}

// GET: any company member can see connection status + the merchant-facing
// phone number -- the access_token column is never selected here.
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
    .from("company_whatsapp_connections")
    .select(SAFE_COLUMNS)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection: data ?? null });
}

// DELETE: admin-only disconnect. Flips status and clears access_token
// (nullable) rather than deleting the row, so the last-connected number
// stays visible -- a no-op (200, connection: null) if nothing was ever
// connected, matching this codebase's idempotent-on-repeat convention.
// Goes straight through the service client: access_token is
// column-privilege-locked for the regular admin client, so nulling it out
// requires bypassing that grant.
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

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("company_whatsapp_connections")
    .update({ status: "disconnected", access_token: null, token_expires_at: null })
    .eq("company_id", companyId)
    .select(SAFE_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection: data ?? null });
}
