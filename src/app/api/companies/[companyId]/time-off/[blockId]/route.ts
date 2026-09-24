import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCompanyRole } from "@/lib/auth/company-access";

// DELETE one time-off entry. Owners/admins remove any; a member only their
// own professional's (2026-09-25).


export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; blockId: string }> },
) {
  const { companyId, blockId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await checkCompanyRole(supabase, companyId, user.id, "member");
  if (memberCheck.error) return memberCheck.error;

  // Look up by id + company_id together so a wrong/foreign id is a clean
  // 404, not a silent no-op — same convention as the products routes.
  const { data: existing, error: lookupError } = await supabase
    .from("company_time_off")
    .select("id, professional_id")
    .eq("id", blockId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!memberCheck.isAdmin && (!existing.professional_id || existing.professional_id !== memberCheck.ownProfessionalId)) {
    return NextResponse.json({ error: "You can only change your own schedule" }, { status: 403 });
  }

  const { error } = await supabase.from("company_time_off").delete().eq("id", blockId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
