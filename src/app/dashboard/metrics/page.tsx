import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { addDays, loadCompanyAnalytics, localToday } from "@/lib/analytics/load";
import { loadGroundingCounts, localDayRangeUtc } from "@/lib/analytics/grounding";
import { agentMetricRole, loadSchedulingAnalytics } from "@/lib/analytics/scheduling";
import { Button } from "@/components/ui/button";
import { BarChartIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { LockedPage } from "../locked-page";
import { PerformanceView, type HealthState } from "./performance-view";
import type { ChartPoint } from "./conversations-chart";
import { DEFAULT_RANGE_DAYS } from "./constants";
import { requireAdminPage } from "@/lib/auth/company-access";

type SeriesPoint = { date: string; count: number };

function chartPoints(current: SeriesPoint[], previous: SeriesPoint[], size: number): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (let end = current.length; end - size >= 0; end -= size) {
    const start = end - size;
    const sum = (series: SeriesPoint[]) => series.slice(start, end).reduce((acc, p) => acc + p.count, 0);
    points.unshift({
      date: current[start].date,
      end: size > 1 ? current[end - 1].date : undefined,
      current: sum(current),
      previous: previous.length > 0 ? sum(previous) : null,
    });
  }
  return points;
}

type HiredRow = {
  status: string;
  name: string | null;
  agent_id: string;
  agents: { slug: string } | null;
};

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; agent?: string }>;
}) {
  // Company-level page: owners/admins only (members get their agenda).
  await requireAdminPage();
  const [{ days: daysParam, agent: agentParam }, supabase, t] = await Promise.all([
    searchParams,
    createClient(),
    getTranslations("Metrics"),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: companies } = await supabase.from("companies").select("id, name, timezone");
  const company = companies?.[0] ?? null;

  if (!company || !user) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader icon={BarChartIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />
        <p className="text-sm text-on-surface-variant">{t("noCompany")}</p>
        <Link href="/dashboard">
          <Button type="button">{t("browseMarketplace")}</Button>
        </Link>
      </div>
    );
  }

  const { data: hiredRaw } = await supabase
    .from("company_agents")
    .select("status, name, agent_id, agents(slug)")
    .eq("company_id", company.id);
  const hiredRows = ((hiredRaw ?? []) as unknown as HiredRow[]).filter((r) => r.agents?.slug);

  if (hiredRows.length === 0) {
    const tl = await getTranslations("Dashboard.locked");
    return (
      <LockedPage
        icon={BarChartIcon}
        pageTitle={t("pageTitle")}
        pageSubtitle={t("pageSubtitle")}
        title={tl("metricsTitle")}
        body={tl("metricsBody")}
        ctaLabel={tl("metricsCta")}
        ctaHref="/dashboard"
      />
    );
  }
  const selected =
    hiredRows.find((r) => r.agents!.slug === agentParam) ??
    hiredRows.find((r) => r.agents!.slug === "malu") ??
    hiredRows[0];
  const selectedSlug = selected.agents!.slug;
  const agentName = selected.name ?? defaultAgentName(selectedSlug);
  const role = agentMetricRole(selectedSlug);

  const rangeValue = daysParam === "7" || daysParam === "90" ? daysParam : DEFAULT_RANGE_DAYS;
  const rangeDays = Number(rangeValue) || 30;
  const granularity = rangeDays >= 90 ? "week" : "day";
  const timezone = company.timezone && company.timezone.length > 0 ? company.timezone : null;
  const to = localToday(timezone ?? "UTC");
  const from = addDays(to, -(rangeDays - 1));

  const rangeOpts = {
    companyId: company.id,
    timezone,
    granularity: "day" as const,
    from,
    to,
    agentId: selected.agent_id,
  };
  const { startUtc, endUtc } = localDayRangeUtc(from, to, timezone);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(rangeDays - 1));
  const prevOpts = { ...rangeOpts, from: prevFrom, to: prevTo };
  const loader = (opts: typeof rangeOpts) =>
    role === "scheduling"
      ? loadSchedulingAnalytics({ supabase, ...opts })
      : loadCompanyAnalytics({ supabase, ...opts });
  const [analytics, previous, groundingCounts] = await Promise.all([
    loader(rangeOpts),
    loader(prevOpts),
    loadGroundingCounts({
      supabase,
      companyId: company.id,
      startUtc,
      endUtc,
      agentId: selected.agent_id,
    }),
  ]);

  const byMetric = new Map(analytics.metrics.map((m) => [m.metric as string, m]));
  const prevByMetric = new Map(previous.metrics.map((m) => [m.metric as string, m]));
  const total = (key: string) => byMetric.get(key)?.total ?? 0;
  const conversationsTotal = total("conversations");
  const currentSeries = byMetric.get("conversations")?.series ?? [];
  const previousSeries = prevByMetric.get("conversations")?.series ?? [];
  const previousTotal = prevByMetric.get("conversations")?.total ?? 0;

  const healthState: HealthState =
    selected.status === "paused" ? "paused" : conversationsTotal === 0 ? "waiting" : "healthy";
  const healthTitle =
    healthState === "paused"
      ? t("health.pausedTitle", { name: agentName })
      : healthState === "waiting"
        ? t("health.waitingTitle", { name: agentName })
        : t("health.healthyTitle", { name: agentName });

  const label = (i18n: string) => t(`metrics.${i18n}.label`);
  const funnel =
    role === "scheduling"
      ? [
          {
            key: "appointments_booked",
            label: label("appointmentsBooked"),
            value: total("appointments_booked"),
          },
          {
            key: "appointments_completed",
            label: label("appointmentsCompleted"),
            value: total("appointments_completed"),
          },
        ]
      : [
          {
            key: "conversations",
            label: label("conversations"),
            value: total("conversations"),
          },
          {
            key: "product_recommendations",
            label: label("productRecommendations"),
            value: total("product_recommendations"),
          },
          {
            key: "buying_intent",
            label: label("buyingIntent"),
            value: total("buying_intent"),
          },
          {
            key: "checkout_clicks",
            label: label("checkoutClicks"),
            value: total("checkout_clicks"),
          },
        ];
  const outcomes =
    role === "scheduling"
      ? [
          {
            key: "appointments_cancelled",
            label: label("appointmentsCancelled"),
            value: total("appointments_cancelled"),
          },
          {
            key: "appointments_no_show",
            label: label("appointmentsNoShow"),
            value: total("appointments_no_show"),
          },
          {
            key: "waitlist_added",
            label: label("waitlistAdded"),
            value: total("waitlist_added"),
          },
        ]
      : [];

  const agentOptions = hiredRows.map((r) => ({
    value: r.agents!.slug,
    label: r.name ?? defaultAgentName(r.agents!.slug),
  }));

  return (
    <Suspense fallback={null}>
      <h1 className="sr-only">{t("pageTitle")}</h1>
      <PerformanceView
        rangeValue={rangeValue}
        rangeDays={rangeDays}
        granularity={granularity}
        agentOptions={agentOptions}
        selectedAgent={selectedSlug}
        labels={{
          range: {
            "7": t("range.last7Days"),
            "30": t("range.last30Days"),
            "90": t("range.last90Days"),
          },
          rangeGroup: t("range.label"),
          agentGroup: t("agentSelectLabel"),
          conversations: label("conversations"),
          funnelTitle: role === "scheduling" ? t("view.schedulingFunnelTitle") : t("view.salesFunnelTitle"),
          funnelBody: role === "scheduling" ? t("view.schedulingFunnelBody") : t("view.salesFunnelBody"),
          notASale: role === "scheduling" ? null : t("notASale"),
        }}
        health={{ state: healthState, title: healthTitle }}
        conversations={{
          total: conversationsTotal,
          previousTotal,
          messages: total("messages"),
        }}
        points={chartPoints(currentSeries, previousSeries, granularity === "week" ? 7 : 1)}
        funnel={funnel}
        outcomes={outcomes}
        reliability={{
          title: t("view.reliabilityTitle"),
          subtitle: t("reliability.subtitle", { name: agentName }),
          emptyBody: t("reliability.empty", { name: agentName }),
          scopeNote: t("reliability.scope"),
          hasActivity: groundingCounts.verified + groundingCounts.regenerated + groundingCounts.blocked > 0,
          stats: [
            {
              key: "verified",
              value: groundingCounts.verified,
              label: t("reliability.verifiedLabel"),
            },
            {
              key: "regenerated",
              value: groundingCounts.regenerated,
              label: t("reliability.regeneratedLabel"),
            },
            {
              key: "blocked",
              value: groundingCounts.blocked,
              label: t("reliability.blockedLabel"),
            },
          ],
          cta:
            groundingCounts.blocked > 0
              ? {
                  href: "/dashboard/conversations",
                  label: t("reliability.cta"),
                }
              : undefined,
        }}
      />
    </Suspense>
  );
}
