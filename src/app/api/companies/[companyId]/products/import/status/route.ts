import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Trello B4 follow-up (2026-09-15) — the import insert runs in `after()`,
// after the POST response is already sent (see the import route's own top
// comment), so nothing about a run's outcome is known at response time.
// This route is what a page reload (or the panel's own live poll) reads
// instead: the most recent product_import_jobs row for the company, RLS-
// scoped the same as every other company member read (no admin gate --
// matches the import POST's own member-not-admin bar).
//
// Deliberately "most recent job", not a specific job id -- a reload has no
// id to ask for in hand, and a merchant only ever cares about their last
// import's outcome, never a history of past ones (no UI surfaces that
// history either). The POST response's own `jobId` is for a same-session
// poll that wants to be certain it's watching *this* run and not a
// still-processing earlier one, in the unlikely case of two overlapping
// imports.

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

export async function GET(
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

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const { data, error } = await supabase
    .from("product_import_jobs")
    .select("id, status, total_rows, inserted_count, error, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    job: data
      ? {
          id: data.id,
          status: data.status,
          totalRows: data.total_rows,
          insertedCount: data.inserted_count,
          error: data.error,
          createdAt: data.created_at,
        }
      : null,
  });
}
