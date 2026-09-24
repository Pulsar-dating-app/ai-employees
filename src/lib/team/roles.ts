import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyRole } from "@/lib/auth/company-access";

// 2026-09-25 -- who may change whose role (decisions.md "Owners/admins
// promote; only the owner demotes or removes"). Pure, so the rules are
// unit-tested on their own; migration 20260925150000 enforces the same in
// RLS for a direct PostgREST call.
export type TeamAction = { kind: "set_role"; role: "admin" | "member" } | { kind: "remove" };

export type TeamActionDenial = "owner_locked" | "cannot_change_self" | "owner_only" | "admin_only" | "no_change";

export function checkTeamAction(input: {
  actorRole: CompanyRole;
  actorId: string;
  targetRole: CompanyRole;
  targetId: string;
  action: TeamAction;
}): { ok: true } | { ok: false; reason: TeamActionDenial } {
  const { actorRole, targetRole, action } = input;
  if (actorRole === "member") return { ok: false, reason: "admin_only" };
  if (targetRole === "owner") return { ok: false, reason: "owner_locked" };
  if (input.actorId === input.targetId) return { ok: false, reason: "cannot_change_self" };

  if (action.kind === "remove") {
    return actorRole === "owner" ? { ok: true } : { ok: false, reason: "owner_only" };
  }
  if (action.role === targetRole) return { ok: false, reason: "no_change" };
  // Promotion (member -> admin): any owner/admin. Demotion: the owner only.
  if (action.role === "member" && actorRole !== "owner") return { ok: false, reason: "owner_only" };
  return { ok: true };
}

// Takes someone out of the company: their seat (company_users), their link
// to a schedule (the professional stays, with its appointments, for the
// owner to reassign or deactivate), and a notice they'll see if they log in
// again. Never the owner.
export async function removeFromCompany(
  service: SupabaseClient,
  companyId: string,
  userId: string,
  removedBy: string | null,
): Promise<void> {
  const { data: company, error: companyError } = await service
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .single();
  if (companyError) throw companyError;

  const { data: removed, error: deleteError } = await service
    .from("company_users")
    .delete()
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .neq("role", "owner")
    .select("user_id");
  if (deleteError) throw deleteError;
  if (!removed || removed.length === 0) return;

  const { error: unlinkError } = await service
    .from("professionals")
    .update({ user_id: null })
    .eq("company_id", companyId)
    .eq("user_id", userId);
  if (unlinkError) throw unlinkError;

  const { error: noticeError } = await service.from("company_member_removals").insert({
    user_id: userId,
    company_id: companyId,
    company_name: company.name as string,
    removed_by: removedBy,
  });
  if (noticeError) throw noticeError;
}

// The newest removal this account hasn't moved past yet, if any -- shown
// instead of onboarding when they log in with no company.
export async function pendingRemovalNotice(
  client: SupabaseClient,
  userId: string,
): Promise<{ id: string; companyName: string } | null> {
  const { data, error } = await client
    .from("company_member_removals")
    .select("id, company_name")
    .eq("user_id", userId)
    .is("acknowledged_at", null)
    .order("removed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, companyName: data.company_name as string } : null;
}
