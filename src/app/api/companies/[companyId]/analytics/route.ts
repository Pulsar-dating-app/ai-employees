import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCompanyRole } from "@/lib/auth/company-access";
import { InvalidRangeError, loadCompanyAnalytics } from "@/lib/analytics/load";

// Trello ticket E2 -- the read side F6's dashboard consumes. Returns the
// exact five metrics spec §15 names (Conversations, Customers, Product
// recommendations, Buying intent, Checkout clicks), each as
// { metric, total, series: [{ date, count }] } over a day- or week-bucketed
// range. No revenue/attribution -- explicitly out of MVP scope per §15.
//
// Member-readable: RLS on conversations/customers/events is all
// is_company_member for SELECT, so this just adds the same explicit
// membership check every sibling route has, to return a clean 403 instead
// of an empty result. All range-resolving + bucketing lives in
// src/lib/analytics/ (loadCompanyAnalytics / aggregateAnalytics), shared
// with F6's page which calls it in-process.


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

  const memberCheck = await checkCompanyRole(supabase, companyId, user.id, "admin");
  if (memberCheck.error) return memberCheck.error;

  // Day boundaries follow the merchant's own timezone (fallback UTC).
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("timezone")
    .eq("id", companyId)
    .single();
  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }

  const searchParams = new URL(request.url).searchParams;

  try {
    const result = await loadCompanyAnalytics({
      supabase,
      companyId,
      timezone: company?.timezone ?? null,
      granularity: searchParams.get("granularity"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InvalidRangeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read analytics data" },
      { status: 500 },
    );
  }
}
