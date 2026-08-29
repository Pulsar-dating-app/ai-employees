import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadAvailableSlots, ServiceNotFoundError } from "@/lib/availability/load";

// Trello I2 -- thin HTTP wrapper over the availability engine. The real
// caller will be J3's find_available_slots tool, calling loadAvailableSlots
// in-process the same way the Agent Engine calls ProductRepository directly
// -- this route exists only so the engine can be validated over real HTTP
// before that tool exists, same justification as B5's products/search/route.ts.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!membership) {
    return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }) };
  }
  return { error: null };
}

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD -- both required. Unlike the analytics
// route, there's no sensible default range: a caller always has a specific
// window in mind (a customer asking "what's open next week"), so a missing
// bound is a client error, not something to guess a default for.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string; serviceId: string }> },
) {
  const { companyId, serviceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!DATE_ONLY.test(from) || !DATE_ONLY.test(to)) {
    return NextResponse.json(
      { error: "from and to are required, as YYYY-MM-DD dates" },
      { status: 400 },
    );
  }
  if (from > to) {
    return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
  }

  try {
    const result = await loadAvailableSlots({ supabase, companyId, serviceId, from, to });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load availability" },
      { status: 500 },
    );
  }
}
