import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_ROLES = ["owner", "admin", "member"] as const;
type CompanyRole = (typeof VALID_ROLES)[number];

// POST: add/invite-member. RLS already blocks the insert unless the caller
// is self-joining or is an admin, but the card asks for a clean 403 instead
// of a raw Postgres error — so the admin check is duplicated here at the
// API layer before attempting the insert. No invite-by-email: the target
// user must already have an account (userId), per A3's MVP scope.
//
// Only the owner can assign the owner role — an admin can add
// members/admins but can't mint another owner (RLS's is_company_admin
// treats owner/admin as equivalent for every other operation, so this
// distinction only exists here at the API layer).
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

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const role = body?.role as CompanyRole | undefined;

  if (!userId || !role || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: "userId and a valid role (owner/admin/member) are required" },
      { status: 400 },
    );
  }

  const { data: callerMembership, error: callerError } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (callerError) {
    return NextResponse.json({ error: callerError.message }, { status: 500 });
  }

  if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
    return NextResponse.json(
      { error: "Only company owners/admins can add members" },
      { status: 403 },
    );
  }

  if (role === "owner" && callerMembership.role !== "owner") {
    return NextResponse.json(
      { error: "Only the company owner can assign the owner role" },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from("company_users")
    .insert({ company_id: companyId, user_id: userId, role })
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500; // unique_violation
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ membership: data }, { status: 201 });
}
