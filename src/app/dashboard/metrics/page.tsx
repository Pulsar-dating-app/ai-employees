import { Suspense } from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { addDays, loadCompanyAnalytics, localToday } from "@/lib/analytics/load";
import {
  agentMetricRole,
  loadSchedulingAnalytics,
  SALES_METRIC_ORDER,
  SCHEDULING_METRIC_ORDER,
} from "@/lib/analytics/scheduling";
import { Button } from "@/components/ui/button";
import { BarChartIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { LockedPage } from "../locked-page";
import { MetricsClient, type MetricCardData } from "./metrics-client";
import type { HealthState } from "./agent-health-card";
import { DEFAULT_RANGE_DAYS } from "./constants";

// Trello F6 — "Measure" (spec §27): a merchant needs to see their team is
// actually working. Renders one hired team member's metrics + a small trend
// line each, plus one honest "how is X doing" read (paused / waiting /
// working). No revenue, no conversion-to-sale — out of MVP scope, and a
// checkout click is never presented as a sale (spec §14/§15).
//
// Which metrics show depends on the selected team member's role: Malu (and
// any future sales agent) gets the spec §15 sales set; Ana gets a scheduling
// set derived from `appointments` (see src/lib/analytics/scheduling.ts). If
// nothing is hired the page is locked, with the tab still visible.
//
// This Server Component does all the data work; MetricsClient owns the
// period toggle, the team-member selector, and the loading transition.

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
  const [{ days: daysParam, agent: agentParam }, supabase, t, locale] = await Promise.all([
    searchParams,
    createClient(),
    getTranslations("Metrics"),
    getLocale(),
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
  // PostgREST returns `agents` as one embedded object; the generated types
  // widen it to an array (same cast the my-agents / scheduling reads make).
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

  // Selected team member: ?agent=slug when it names a hired one, else Malu if
  // she's hired, else the first hire.
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
    granularity,
    from,
    to,
    agentId: selected.agent_id,
  };
  const analytics =
    role === "scheduling"
      ? await loadSchedulingAnalytics({ supabase, ...rangeOpts })
      : await loadCompanyAnalytics({ supabase, ...rangeOpts });
  const metricOrder = role === "scheduling" ? SCHEDULING_METRIC_ORDER : SALES_METRIC_ORDER;

  const byMetric = new Map(analytics.metrics.map((m) => [m.metric, m]));
  const conversationsTotal = byMetric.get("conversations")?.total ?? 0;

  let healthState: HealthState;
  if (selected.status === "paused") healthState = "paused";
  else if (conversationsTotal === 0) healthState = "waiting";
  else healthState = "healthy";

  const HEALTH_COPY: Record<HealthState, { title: string; body: string }> = {
    healthy: {
      title: t("health.healthyTitle", { name: agentName }),
      body: t("health.healthyBody", { name: agentName, conversations: conversationsTotal }),
    },
    waiting: {
      title: t("health.waitingTitle", { name: agentName }),
      body: t("health.waitingBody", { name: agentName }),
    },
    paused: {
      title: t("health.pausedTitle", { name: agentName }),
      body: t("health.pausedBody", { name: agentName }),
    },
    not_hired: {
      title: t("health.notHiredTitle", { name: agentName }),
      body: t("health.notHiredBody", { name: agentName }),
    },
  };

  const numberFormat = new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US");

  const cards: MetricCardData[] = metricOrder.map(({ key, i18n }) => {
    const m = byMetric.get(key);
    return {
      key,
      label: t(`metrics.${i18n}.label`),
      caption: t(`metrics.${i18n}.caption`),
      value: numberFormat.format(m?.total ?? 0),
      series: m?.series.map((p) => p.count) ?? [],
    };
  });

  const agentOptions = hiredRows.map((r) => ({
    value: r.agents!.slug,
    label: r.name ?? defaultAgentName(r.agents!.slug),
  }));

  return (
    <Suspense fallback={null}>
      <MetricsClient
        rangeValue={rangeValue}
        agentOptions={agentOptions}
        selectedAgent={selectedSlug}
        header={{ title: t("pageTitle"), subtitle: t("pageSubtitle") }}
        overview={{ title: t("overviewTitle"), subtitle: t("overviewSubtitle") }}
        rangeLabels={{
          "7": t("range.last7Days"),
          "30": t("range.last30Days"),
          "90": t("range.last90Days"),
        }}
        rangeGroupLabel={t("range.label")}
        agentGroupLabel={t("agentSelectLabel")}
        cards={cards}
        notASale={t("notASale")}
        health={{
          state: healthState,
          title: HEALTH_COPY[healthState].title,
          body: HEALTH_COPY[healthState].body,
        }}
      />
    </Suspense>
  );
}
