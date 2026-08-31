import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Company time off (K3's time-off card) — merchant-registered date ranges
// when nobody is available for appointments. The recurring weekly template
// lives in `business_hours` (H2); this is only one-off closures. Member-level
// like business-hours, matching the rest of the scheduling routes.

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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REASON_LENGTH = 500;

// GET: the company's time off. `?upcoming=true` drops anything already over
// (end_date before today, UTC — a settings list doesn't need per-timezone
// midnight precision). Ordered soonest-first for display.
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

  let query = supabase
    .from("company_time_off")
    .select("id, start_date, end_date, reason")
    .eq("company_id", companyId)
    .order("start_date", { ascending: true });

  if (new URL(request.url).searchParams.get("upcoming") === "true") {
    query = query.gte("end_date", new Date().toISOString().slice(0, 10));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ timeOff: data });
}

// POST: add a range. Body { startDate, endDate, reason? } — startDate and
// endDate are YYYY-MM-DD calendar dates, endDate inclusive (a single day off
// is startDate === endDate). No timezone in the body: the availability
// engine resolves these against the company's timezone at read time.
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

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const body = await request.json().catch(() => null);
  const startDate = body?.startDate;
  const endDate = body?.endDate;
  const reasonRaw = body?.reason;

  if (typeof startDate !== "string" || !DATE_PATTERN.test(startDate)) {
    return NextResponse.json({ error: "startDate must be a YYYY-MM-DD date" }, { status: 400 });
  }
  if (typeof endDate !== "string" || !DATE_PATTERN.test(endDate)) {
    return NextResponse.json({ error: "endDate must be a YYYY-MM-DD date" }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });
  }
  if (reasonRaw !== undefined && reasonRaw !== null && typeof reasonRaw !== "string") {
    return NextResponse.json({ error: "reason must be a string" }, { status: 400 });
  }
  const reason =
    typeof reasonRaw === "string" && reasonRaw.trim()
      ? reasonRaw.trim().slice(0, MAX_REASON_LENGTH)
      : null;

  const { data, error } = await supabase
    .from("company_time_off")
    .insert({ company_id: companyId, start_date: startDate, end_date: endDate, reason })
    .select("id, start_date, end_date, reason")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ timeOff: data }, { status: 201 });
}
