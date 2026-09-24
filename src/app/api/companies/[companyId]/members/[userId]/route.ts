import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkCompanyRole, type CompanyRole } from "@/lib/auth/company-access";
import { checkTeamAction, removeFromCompany, type TeamAction } from "@/lib/team/roles";

// 2026-09-25 -- one person's place in the company:
//   PATCH { role: "admin" | "member" } -- an owner or admin promotes a member
//     to admin; only the owner demotes an admin back to member;
//   DELETE -- only the owner removes someone (they get a notice if they log
//     in again; their schedule stays, unlinked).
// The owner is never changed or removed, and nobody changes themselves.
// Rules in checkTeamAction (src/lib/team/roles.ts); RLS mirrors them
// (migration 20260925150000). Writes go through the service client after
// the check, like the other team routes.

async function authorize(companyId: string, targetId: string, action: TeamAction) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const actor = await checkCompanyRole(supabase, companyId, user.id, "admin");
  if (actor.error) return { error: actor.error };

  const service = createServiceClient();
  const { data: target, error } = await service
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", targetId)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!target) return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 404 }) };

  const verdict = checkTeamAction({
    actorRole: actor.role,
    actorId: user.id,
    targetRole: target.role as CompanyRole,
    targetId,
    action,
  });
  if (!verdict.ok) {
    return { error: NextResponse.json({ error: verdict.reason }, { status: verdict.reason === "no_change" ? 409 : 403 }) };
  }
  return { error: null, service, actorId: user.id };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string; userId: string }> },
) {
  const { companyId, userId } = await params;
  const body = await request.json().catch(() => null);
  const role = body?.role;
  if (role !== "admin" && role !== "member") {
    return NextResponse.json({ error: "role must be \"admin\" or \"member\"" }, { status: 400 });
  }

  const auth = await authorize(companyId, userId, { kind: "set_role", role });
  if (auth.error) return auth.error;

  const { data, error } = await auth.service
    .from("company_users")
    .update({ role })
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .neq("role", "owner")
    .select("user_id, role")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ membership: { userId: data.user_id, role: data.role } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; userId: string }> },
) {
  const { companyId, userId } = await params;
  const auth = await authorize(companyId, userId, { kind: "remove" });
  if (auth.error) return auth.error;

  await removeFromCompany(auth.service, companyId, userId, auth.actorId);
  return NextResponse.json({ ok: true });
}
