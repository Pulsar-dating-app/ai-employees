import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aggregateAnalytics, type Granularity } from "@/lib/analytics/aggregate";

// Trello ticket E2 -- the read side F6's dashboard consumes directly.
// Returns the exact five metrics spec §15 names (Conversations, Customers,
// Product recommendations, Buying intent, Checkout clicks), each as
// { metric, total, series: [{ date, count }] } over a day- or week-bucketed
// range. No revenue/attribution -- explicitly out of MVP scope per §15.
//
// Member-readable: RLS on conversations/customers/events is all
// is_company_member for SELECT, so this endpoint just adds the same
// explicit membership check every sibling route has, to return a clean 403
// instead of an empty result. The pure bucketing lives in
// src/lib/analytics/aggregate.ts (unit-tested); this handler is IO only.

const DEFAULT_TIMEZONE = "UTC";
// Bounds the zero-fill loop and the row scan. 370 days ~ a year plus a
// little slack; re-visit if a real dashboard need wants longer history.
const MAX_RANGE_DAYS = 370;
const DEFAULT_SPAN_DAYS: Record<Granularity, number> = { day: 30, week: 84 };
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// PostgREST's default hard cap per response. We page past it rather than
// silently undercount a busy company's events.
const PAGE_SIZE = 1000;

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

function parseGranularity(value: string | null): Granularity {
  // Lenient like the products list route's param parsing -- an unrecognized
  // value falls back to the default rather than 400ing.
  return value === "week" ? "week" : "day";
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function localToday(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type Row = { created_at: string; type?: string };

// Reads every row for one table inside the UTC window, paging past
// PostgREST's 1000-row cap so counts stay exact for a high-volume company.
async function fetchWindow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "conversations" | "customers" | "events",
  columns: string,
  companyId: string,
  startUtc: string,
  endUtc: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("company_id", companyId)
      .gte("created_at", startUtc)
      .lt("created_at", endUtc)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
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

  const searchParams = new URL(request.url).searchParams;
  const granularity = parseGranularity(searchParams.get("granularity"));

  // Day boundaries follow the merchant's own timezone, so "today" on the
  // dashboard means their today. Falls back to UTC if unset/invalid.
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("timezone")
    .eq("id", companyId)
    .single();
  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }
  const timezone =
    company?.timezone && isValidTimeZone(company.timezone) ? company.timezone : DEFAULT_TIMEZONE;

  const toParam = searchParams.get("to");
  const to = toParam && DATE_ONLY.test(toParam) ? toParam : localToday(timezone);

  const fromParam = searchParams.get("from");
  const defaultFrom = addDays(to, -(DEFAULT_SPAN_DAYS[granularity] - 1));
  const fromRaw = fromParam && DATE_ONLY.test(fromParam) ? fromParam : defaultFrom;

  if (fromRaw > to) {
    return NextResponse.json(
      { error: "`from` must be on or before `to`" },
      { status: 400 },
    );
  }

  // Clamp an over-long range rather than rejecting it -- the caller still
  // gets a valid (bounded) answer.
  const minFrom = addDays(to, -(MAX_RANGE_DAYS - 1));
  const from = fromRaw < minFrom ? minFrom : fromRaw;

  // The DB query is in UTC; widen by a day on each side so no local-tz
  // calendar day in [from, to] is missed regardless of offset.
  // aggregateAnalytics() re-filters to the exact local range.
  const startUtc = `${addDays(from, -1)}T00:00:00.000Z`;
  const endUtc = `${addDays(to, 2)}T00:00:00.000Z`;

  let conversations: Row[];
  let customers: Row[];
  let events: Row[];
  try {
    [conversations, customers, events] = await Promise.all([
      fetchWindow(supabase, "conversations", "created_at", companyId, startUtc, endUtc),
      fetchWindow(supabase, "customers", "created_at", companyId, startUtc, endUtc),
      fetchWindow(supabase, "events", "created_at, type", companyId, startUtc, endUtc),
    ]);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read analytics data" },
      { status: 500 },
    );
  }

  const metrics = aggregateAnalytics({
    timezone,
    granularity,
    from,
    to,
    conversations: conversations as { created_at: string }[],
    customers: customers as { created_at: string }[],
    events: events as { created_at: string; type: string }[],
  });

  return NextResponse.json({ granularity, timezone, range: { from, to }, metrics });
}
