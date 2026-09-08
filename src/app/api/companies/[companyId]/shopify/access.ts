import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";

// Membership gates for the Shopify connection routes. The product routes
// copy this helper into every file; the four Shopify routes share it from
// here instead (still feature-local, not a global). RLS
// (private.is_company_member / private.is_company_admin) is the real
// enforcement -- these just turn a denial into a clean 401/403.

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export async function requireMember(supabase: ServerClient, companyId: string, userId: string) {
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
  return { error: null as null, role: membership.role as string };
}

export async function requireAdmin(supabase: ServerClient, companyId: string, userId: string) {
  const membership = await requireMember(supabase, companyId, userId);
  if (membership.error) return membership;

  if (!["owner", "admin"].includes(membership.role!)) {
    return {
      error: NextResponse.json(
        { error: "Only company owners/admins can manage the Shopify connection" },
        { status: 403 },
      ),
      role: membership.role,
    };
  }
  return membership;
}

// Every place a Shopify connection row is returned to a client. Never
// includes access_token or refresh_token (column-privilege-locked to the
// service role).
export const SHOPIFY_CONNECTION_SAFE_COLUMNS =
  "shop_domain, shop_name, currency, scope, status, connected_at, last_synced_at, token_expires_at";
