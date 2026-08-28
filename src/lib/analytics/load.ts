import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateAnalytics, type Granularity, type MetricSeries } from "./aggregate";

// Trello ticket E2 / F6 — the DB side of the analytics read, shared by the
// HTTP route (`GET .../analytics`) and F6's dashboard page, which calls it
// in-process rather than paying an internal HTTP hop (same pattern as the
// Agent Engine calling ProductRepository directly). The pure bucketing is
// in aggregate.ts; this module is the "read the right rows" half.

const PAGE_SIZE = 1000;
// Bounds the zero-fill loop and the row scan. ~a year plus slack.
export const MAX_RANGE_DAYS = 370;
export const DEFAULT_SPAN_DAYS: Record<Granularity, number> = { day: 30, week: 84 };
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIMEZONE = "UTC";

export class InvalidRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRangeError";
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// A UTC instant -> the "YYYY-MM-DD" calendar date it falls on in `tz`.
// Built from `formatToParts` rather than a locale's short-date string:
// the `en-CA` "give me an ISO date" trick silently produces other formats
// on Node builds without that locale's data, which then breaks addDays().
export function localDate(tz: string, instant: Date): string {
  const utcFallback = instant.toISOString().slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const result = `${pick("year")}-${pick("month")}-${pick("day")}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : utcFallback;
  } catch {
    return utcFallback;
  }
}

// Plain calendar arithmetic on a date-only string, via UTC accessors so no
// timezone is ever re-introduced — the input is already a local calendar date.
export function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function localToday(tz: string): string {
  return localDate(isValidTimeZone(tz) ? tz : "UTC", new Date());
}

type Row = { created_at: string; type?: string };

// Reads every row for one table inside the UTC window, paging past
// PostgREST's 1000-row cap so counts stay exact for a high-volume company.
async function fetchWindow(
  supabase: SupabaseClient,
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

export type AnalyticsResult = {
  granularity: Granularity;
  timezone: string;
  range: { from: string; to: string };
  metrics: MetricSeries[];
};

export type LoadAnalyticsOptions = {
  supabase: SupabaseClient;
  companyId: string;
  // The company's own `timezone` column (may be null/blank/invalid).
  timezone: string | null;
  granularity?: string | null;
  from?: string | null;
  to?: string | null;
};

// Resolves the range, reads the windows, and aggregates. Throws
// InvalidRangeError for `from` after `to`; any Supabase failure surfaces as
// a plain Error for the caller to map to a 500.
export async function loadCompanyAnalytics(opts: LoadAnalyticsOptions): Promise<AnalyticsResult> {
  const granularity: Granularity = opts.granularity === "week" ? "week" : "day";
  const timezone =
    opts.timezone && isValidTimeZone(opts.timezone) ? opts.timezone : DEFAULT_TIMEZONE;

  const to = opts.to && DATE_ONLY.test(opts.to) ? opts.to : localToday(timezone);
  const defaultFrom = addDays(to, -(DEFAULT_SPAN_DAYS[granularity] - 1));
  const fromRaw = opts.from && DATE_ONLY.test(opts.from) ? opts.from : defaultFrom;

  if (fromRaw > to) {
    throw new InvalidRangeError("`from` must be on or before `to`");
  }

  // Clamp an over-long range rather than rejecting it.
  const minFrom = addDays(to, -(MAX_RANGE_DAYS - 1));
  const from = fromRaw < minFrom ? minFrom : fromRaw;

  // The DB query is in UTC; widen by a day on each side so no local-tz
  // calendar day in [from, to] is missed. aggregateAnalytics re-filters.
  const startUtc = `${addDays(from, -1)}T00:00:00.000Z`;
  const endUtc = `${addDays(to, 2)}T00:00:00.000Z`;

  const [conversations, customers, events] = await Promise.all([
    fetchWindow(opts.supabase, "conversations", "created_at", opts.companyId, startUtc, endUtc),
    fetchWindow(opts.supabase, "customers", "created_at", opts.companyId, startUtc, endUtc),
    fetchWindow(opts.supabase, "events", "created_at, type", opts.companyId, startUtc, endUtc),
  ]);

  const metrics = aggregateAnalytics({
    timezone,
    granularity,
    from,
    to,
    conversations: conversations as { created_at: string }[],
    customers: customers as { created_at: string }[],
    events: events as { created_at: string; type: string }[],
  });

  return { granularity, timezone, range: { from, to }, metrics };
}
