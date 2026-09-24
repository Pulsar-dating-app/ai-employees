import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// 2026-09-25 -- one place that answers "who is this, in which company, with
// which role, and which professional's schedule is theirs" (see decisions.md
// "Team members join by email"). `company_users` is the only source of login
// and role; `professionals.user_id` says whose schedule a login owns. Owners
// and admins see the whole dashboard; a `member` is a professional who logs
// in to see their own agenda and settings only.

export type CompanyRole = "owner" | "admin" | "member";

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export type CurrentAccess = {
  user: User | null;
  userName: string | null;
  company: { id: string; name: string; onboarding_completed_at: string | null } | null;
  role: CompanyRole | null;
  isAdmin: boolean;
  // The professional linked to this login, if any (active or not).
  professional: { id: string; name: string; is_active: boolean } | null;
};

async function loadAccess(supabase: SupabaseClient): Promise<CurrentAccess> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, userName: null, company: null, role: null, isAdmin: false, professional: null };

  const [{ data: me }, { data: membership }] = await Promise.all([
    supabase.from("users").select("name").eq("id", user.id).maybeSingle(),
    supabase
      .from("company_users")
      .select("role, companies(id, name, onboarding_completed_at)")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const userName = ((me?.name as string | null | undefined) ?? "").trim() || null;
  const row = membership as unknown as {
    role: CompanyRole;
    companies: { id: string; name: string; onboarding_completed_at: string | null } | null;
  } | null;
  if (!row?.companies) return { user, userName, company: null, role: null, isAdmin: false, professional: null };

  const { data: professional } = await supabase
    .from("professionals")
    .select("id, name, is_active")
    .eq("company_id", row.companies.id)
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    user,
    userName,
    company: row.companies,
    role: row.role,
    isAdmin: isAdminRole(row.role),
    professional: (professional as CurrentAccess["professional"]) ?? null,
  };
}

// Server Components: deduped per request, so the dashboard layout and the
// page under it share one lookup.
export const getCurrentAccess = cache(async (): Promise<CurrentAccess> => loadAccess(await createClient()));

// Admin-only dashboard pages call this first; a member is sent to their
// agenda instead.
export async function requireAdminPage(): Promise<CurrentAccess> {
  const access = await getCurrentAccess();
  if (access.company && !access.isAdmin) redirect("/dashboard/scheduling");
  return access;
}

// API routes: the caller's role in `companyId` (403 when not a member, or
// not an owner/admin with `level: "admin"`), plus the professional linked to
// them -- which is all a member is allowed to act on.
export async function checkCompanyRole(
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
  level: "member" | "admin",
): Promise<
  | { error: NextResponse; role?: undefined; isAdmin?: undefined; ownProfessionalId?: undefined }
  | { error: null; role: CompanyRole; isAdmin: boolean; ownProfessionalId: string | null }
> {
  const { data: membership, error } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!membership) return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }) };

  const role = membership.role as CompanyRole;
  const isAdmin = isAdminRole(role);
  if (level === "admin" && !isAdmin) {
    return { error: NextResponse.json({ error: "Only company owners/admins can do this" }, { status: 403 }) };
  }

  let ownProfessionalId: string | null = null;
  if (!isAdmin) {
    const { data: professional } = await supabase
      .from("professionals")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    ownProfessionalId = (professional?.id as string | undefined) ?? null;
  }
  return { error: null, role, isAdmin, ownProfessionalId };
}
