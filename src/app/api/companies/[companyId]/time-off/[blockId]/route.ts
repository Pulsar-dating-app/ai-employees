import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// DELETE one time-off entry. Same member gate as the collection route.

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
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!membership) {
    return {
      error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }),
    };
  }
  return { error: null };
}

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

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  // Look up by id + company_id together so a wrong/foreign id is a clean
  // 404, not a silent no-op — same convention as the products routes.
  const { data: existing, error: lookupError } = await supabase
    .from("company_time_off")
    .select("id")
    .eq("id", blockId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase.from("company_time_off").delete().eq("id", blockId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
