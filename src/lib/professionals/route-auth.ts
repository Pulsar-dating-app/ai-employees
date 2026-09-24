import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageProfessional, getProfessional, type Professional } from "./repository";

type RouteClient = Awaited<ReturnType<typeof createClient>>;

type AccessResult =
  | { error: NextResponse; supabase?: undefined; userId?: undefined; professional?: undefined; role?: undefined }
  | { error: null; supabase: RouteClient; userId: string; professional: Professional; role: string };

// 2026-09-24 -- shared gate for every /professionals/[professionalId]/...
// route. `level: "view"` = any company member; `level: "manage"` = company
// owner/admin, or the team member linked to this professional (they manage
// their own schedule without being an admin). 404 for a professional of
// another company, so ids can't be probed across companies.
export async function requireProfessionalAccess(
  companyId: string,
  professionalId: string,
  level: "view" | "manage",
): Promise<AccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const { data: membership, error: membershipError } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) return { error: NextResponse.json({ error: membershipError.message }, { status: 500 }) };
  if (!membership) return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }) };

  const professional = await getProfessional(supabase, companyId, professionalId);
  if (!professional) return { error: NextResponse.json({ error: "Professional not found" }, { status: 404 }) };

  if (level === "manage" && !(await canManageProfessional(supabase, companyId, professionalId, user.id))) {
    return {
      error: NextResponse.json(
        { error: "Only company owners/admins, or the professional themselves, can change this schedule" },
        { status: 403 },
      ),
    };
  }

  return { error: null, supabase, userId: user.id, professional, role: membership.role as string };
}

// Company-level gate for the /professionals collection routes.
export async function requireCompanyRole(
  companyId: string,
  level: "member" | "admin",
): Promise<{ error: NextResponse } | { error: null; supabase: RouteClient; userId: string; role: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const { data: membership, error } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!membership) return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }) };
  if (level === "admin" && !["owner", "admin"].includes(membership.role as string)) {
    return { error: NextResponse.json({ error: "Only company owners/admins can do this" }, { status: 403 }) };
  }
  return { error: null, supabase, userId: user.id, role: membership.role as string };
}
