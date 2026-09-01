// Trello ticket E2 -- the pure aggregation core behind the analytics API.
// Kept out of the route handler so the bucketing logic (timezone-aware day
// boundaries, ISO-week grouping, zero-filling) is unit-testable without a
// DB or HTTP, matching how B5 (ProductRepository) and C4 (checkout/links)
// split their pure logic out of the IO layer.
//
// Covers exactly the five metrics spec §15 names for the initial dashboard:
// Conversations, Customers, Product recommendations, Buying intent,
// Checkout clicks. Nothing here touches revenue or attribution -- out of
// MVP scope by that same section.

export type Granularity = "day" | "week";

export type MetricSeriesPoint = { date: string; count: number };
export type MetricSeries = { metric: MetricKey; total: number; series: MetricSeriesPoint[] };

// Response metric keys, in the order spec §15 lists them. `conversations`
// and `customers` come from their own tables; the other three are
// `events` rows filtered by `type`.
export const METRIC_KEYS = [
  "conversations",
  "customers",
  "product_recommendations",
  "buying_intent",
  "checkout_clicks",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

// events.type -> response metric key.
const EVENT_TYPE_TO_METRIC: Record<string, MetricKey> = {
  product_recommendation: "product_recommendations",
  buying_intent: "buying_intent",
  checkout_click: "checkout_clicks",
};

export type AggregateInput = {
  timezone: string;
  granularity: Granularity;
  // Inclusive calendar-date bounds ("YYYY-MM-DD"), interpreted in `timezone`.
  from: string;
  to: string;
  conversations: readonly { created_at: string }[];
  customers: readonly { created_at: string }[];
  events: readonly { created_at: string; type: string }[];
};

// A UTC instant -> the "YYYY-MM-DD" calendar date it falls on in `tz`.
// Built from `formatToParts` (with the always-present `en-US` locale) so it
// stays ISO-shaped regardless of which locale data the Node build ships —
// the `en-CA` short-date trick silently produces other formats without it.
// Exported so a per-agent aggregator (src/lib/analytics/scheduling.ts) can
// reuse the exact same bucketing primitives as the company-wide one.
export function makeLocalDateFn(tz: string): (isoInstant: string) => string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return (isoInstant) => {
    const parts = fmt.formatToParts(new Date(isoInstant));
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
  };
}

// Plain calendar arithmetic on a date-only string. Uses UTC accessors so it
// never re-introduces a timezone: the input is already a local calendar
// date, we're just walking the calendar.
function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Monday of the ISO week containing `dateOnly`.
export function weekStart(dateOnly: string): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  const mondayOffset = (d.getUTCDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0, ...
  return addDays(dateOnly, -mondayOffset);
}

export function bucketKeyFor(localDate: string, granularity: Granularity): string {
  return granularity === "week" ? weekStart(localDate) : localDate;
}

// Every bucket key from `from` to `to` inclusive, so a sparse dataset still
// renders a continuous line in F6's chart. For weekly granularity the first
// key is the Monday on/before `from` (a possibly-partial leading week).
export function bucketKeysInRange(
  from: string,
  to: string,
  granularity: Granularity,
): string[] {
  const step = granularity === "week" ? 7 : 1;
  const keys: string[] = [];
  let cursor = granularity === "week" ? weekStart(from) : from;
  while (cursor <= to) {
    keys.push(cursor);
    cursor = addDays(cursor, step);
  }
  return keys;
}

export function aggregateAnalytics(input: AggregateInput): MetricSeries[] {
  const { timezone, granularity, from, to } = input;
  const localDateOf = makeLocalDateFn(timezone);
  const buckets = bucketKeysInRange(from, to, granularity);

  const counts: Record<MetricKey, Map<string, number>> = {
    conversations: new Map(buckets.map((b) => [b, 0])),
    customers: new Map(buckets.map((b) => [b, 0])),
    product_recommendations: new Map(buckets.map((b) => [b, 0])),
    buying_intent: new Map(buckets.map((b) => [b, 0])),
    checkout_clicks: new Map(buckets.map((b) => [b, 0])),
  };

  const tally = (createdAt: string, metric: MetricKey) => {
    const localDate = localDateOf(createdAt);
    // A row can slip in from just outside the requested range because the
    // DB query widens the window to cover any timezone offset -- drop it
    // here once we know its real local date.
    if (localDate < from || localDate > to) return;
    const key = bucketKeyFor(localDate, granularity);
    counts[metric].set(key, (counts[metric].get(key) ?? 0) + 1);
  };

  for (const row of input.conversations) tally(row.created_at, "conversations");
  for (const row of input.customers) tally(row.created_at, "customers");
  for (const row of input.events) {
    const metric = EVENT_TYPE_TO_METRIC[row.type];
    if (metric) tally(row.created_at, metric);
  }

  return METRIC_KEYS.map((metric) => {
    const series = buckets.map((date) => ({ date, count: counts[metric].get(date) ?? 0 }));
    const total = series.reduce((sum, point) => sum + point.count, 0);
    return { metric, total, series };
  });
}
