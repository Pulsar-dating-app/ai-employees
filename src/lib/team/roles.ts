import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyRole } from "@/lib/auth/company-access";
import { countActiveProfessionals, countUpcomingAppointments } from "@/lib/professionals/repository";

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

// Why removing someone can't happen yet: removal also turns their schedule
// off, so -- like deactivating it -- it's refused while that schedule still
// has bookings ahead, or when it's the company's last active one.
export type RemovalBlocker =
  | { error: "has_upcoming_appointments"; count: number }
  | { error: "last_active_professional" };

export async function removalBlocker(
  service: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<RemovalBlocker | null> {
  const { data, error } = await service
    .from("professionals")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  const ids = (data ?? []).map((row) => row.id as string);
  if (ids.length === 0) return null;

  let upcoming = 0;
  for (const id of ids) upcoming += await countUpcomingAppointments(service, companyId, id);
  if (upcoming > 0) return { error: "has_upcoming_appointments", count: upcoming };

  if ((await countActiveProfessionals(service, companyId)) - ids.length <= 0) {
    return { error: "last_active_professional" };
  }
  return null;
}

// Takes someone out of the company: their seat (company_users), their
// schedule (unlinked and turned off -- Ana stops offering it; its history
// stays and it can be reactivated), and a notice they'll see if they log in
// again. Never the owner. Callers check removalBlocker first.
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
    .update({ user_id: null, is_active: false })
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
