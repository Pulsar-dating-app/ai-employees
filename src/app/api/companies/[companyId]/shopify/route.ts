import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, requireMember, SHOPIFY_CONNECTION_SAFE_COLUMNS } from "./access";

// Shopify connection status (read) + disconnect. The connect action lives
// in ./connect/route.ts (it needs the OAuth round trip). Direct structural
// copy of the calendar and Instagram connection routes.
//
// company_shopify_connections.access_token is column-privilege-locked
// (migration 20260908100200) -- every select here lists safe columns and
// never includes it for the regular (non-service) client.

// GET: any company member can see connection status.
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
    .from("company_shopify_connections")
    .select(SHOPIFY_CONNECTION_SAFE_COLUMNS)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection: data ?? null });
}

// DELETE: admin-only disconnect. Flips status and clears the token rather
// than deleting the row (keeps history, frees the shop for the partial
// unique index). Idempotent -- 200 with connection: null when nothing was
// connected. Through the service client: access_token is column-locked.
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
    .from("company_shopify_connections")
    .update({ status: "disconnected", access_token: null })
    .eq("company_id", companyId)
    .select(SHOPIFY_CONNECTION_SAFE_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection: data ?? null });
}
