import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bucketKeyFor,
  bucketKeysInRange,
  makeLocalDateFn,
  type Granularity,
  type MetricSeriesPoint,
} from "./aggregate";
import { resolveAnalyticsRange, type LoadAnalyticsOptions } from "./load";

// Which metric set the Performance page shows for a given hired agent.
// Keyed on slug (the same signal `SCHEDULING_AGENT_SLUG` uses on the
// scheduling page) — when agent roles become structured data this becomes a
// column lookup, but today "ana does scheduling, everyone else sells" is the
// whole taxonomy.
export const SCHEDULING_AGENT_SLUGS = new Set(["ana"]);

export type AgentMetricRole = "sales" | "scheduling";

export function agentMetricRole(slug: string): AgentMetricRole {
  return SCHEDULING_AGENT_SLUGS.has(slug) ? "scheduling" : "sales";
}

// `key` is the metric id (also the sparkline icon key in metrics-client);
// `i18n` is the suffix under `Metrics.metrics.*` for its label/caption.
export const SALES_METRIC_ORDER = [
  { key: "conversations", i18n: "conversations" },
  { key: "product_recommendations", i18n: "productRecommendations" },
  { key: "buying_intent", i18n: "buyingIntent" },
  { key: "checkout_clicks", i18n: "checkoutClicks" },
] as const;

export const SCHEDULING_METRIC_ORDER = [
  { key: "conversations", i18n: "conversations" },
  { key: "appointments_booked", i18n: "appointmentsBooked" },
  { key: "appointments_completed", i18n: "appointmentsCompleted" },
  { key: "appointments_cancelled", i18n: "appointmentsCancelled" },
] as const;

export type GenericMetricSeries = {
  metric: string;
  total: number;
  series: MetricSeriesPoint[];
};

export type SchedulingAnalyticsResult = {
  granularity: Granularity;
  timezone: string;
  range: { from: string; to: string };
  metrics: GenericMetricSeries[];
};

type SchedulingLoadOptions = Pick<
  LoadAnalyticsOptions,
  "companyId" | "timezone" | "granularity" | "from" | "to"
> & { supabase: SupabaseClient; agentId: string };

// Per-agent scheduling read for the Performance page: the conversations this
// agent had + the appointments they booked, split by the appointment's
// current status. Bucketed on `created_at` (when the booking was made), like
// every other metric on that page; `status` being the *current* status is an
// accepted approximation until per-status-change events exist (follow-up
// ticket — see .claude/docs/decisions.md).
export async function loadSchedulingAnalytics(
  opts: SchedulingLoadOptions,
): Promise<SchedulingAnalyticsResult> {
  const { granularity, timezone, from, to, startUtc, endUtc } = resolveAnalyticsRange(opts);
  const localDateOf = makeLocalDateFn(timezone);
  const buckets = bucketKeysInRange(from, to, granularity);

  const [conv, appt] = await Promise.all([
    opts.supabase
      .from("conversations")
      .select("created_at")
      .eq("company_id", opts.companyId)
      .eq("agent_id", opts.agentId)
      .gte("created_at", startUtc)
      .lt("created_at", endUtc),
    opts.supabase
      .from("appointments")
      .select("created_at, status")
      .eq("company_id", opts.companyId)
      .eq("agent_id", opts.agentId)
      .gte("created_at", startUtc)
      .lt("created_at", endUtc),
  ]);
  if (conv.error) throw new Error(conv.error.message);
  if (appt.error) throw new Error(appt.error.message);

  const zeroed = () => new Map<string, number>(buckets.map((b) => [b, 0]));
  const counts: Record<string, Map<string, number>> = {
    conversations: zeroed(),
    appointments_booked: zeroed(),
    appointments_completed: zeroed(),
    appointments_cancelled: zeroed(),
  };

  const tally = (createdAt: string, metric: string) => {
    const localDate = localDateOf(createdAt);
    // Widened DB window can pull in rows just outside [from, to] — drop them
    // once their real local date is known (same guard as aggregateAnalytics).
    if (localDate < from || localDate > to) return;
    const key = bucketKeyFor(localDate, granularity);
    counts[metric].set(key, (counts[metric].get(key) ?? 0) + 1);
  };

  for (const r of (conv.data ?? []) as { created_at: string }[]) {
    tally(r.created_at, "conversations");
  }
  for (const r of (appt.data ?? []) as { created_at: string; status: string }[]) {
    tally(r.created_at, "appointments_booked");
    if (r.status === "completed") tally(r.created_at, "appointments_completed");
    if (r.status === "cancelled") tally(r.created_at, "appointments_cancelled");
  }

  const metrics: GenericMetricSeries[] = Object.keys(counts).map((metric) => {
    const series = buckets.map((date) => ({ date, count: counts[metric].get(date) ?? 0 }));
    return { metric, total: series.reduce((sum, p) => sum + p.count, 0), series };
  });

  return { granularity, timezone, range: { from, to }, metrics };
}
