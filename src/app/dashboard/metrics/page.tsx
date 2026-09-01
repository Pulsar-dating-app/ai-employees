import { Suspense } from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { addDays, loadCompanyAnalytics, localToday } from "@/lib/analytics/load";
import type { MetricKey } from "@/lib/analytics/aggregate";
import { Button } from "@/components/ui/button";
import { BarChartIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { MetricsClient, type MetricCardData } from "./metrics-client";
import type { HealthState } from "./agent-health-card";
import { DEFAULT_RANGE_DAYS } from "./constants";

// Order and identity match spec §15's dashboard terminology exactly.
const METRIC_ORDER: { key: MetricKey; i18n: string }[] = [
  { key: "conversations", i18n: "conversations" },
  { key: "customers", i18n: "customers" },
  { key: "product_recommendations", i18n: "productRecommendations" },
  { key: "buying_intent", i18n: "buyingIntent" },
  { key: "checkout_clicks", i18n: "checkoutClicks" },
];

// Trello F6 — "Measure" (spec §27): a merchant needs to see Malu is
// actually working. Renders E2's five metrics + a small trend line each,
// plus one honest "how is Malu doing" read (hired / paused / waiting /
// working). No revenue, no conversion-to-sale — out of MVP scope, and a
// checkout click is never presented as a sale (spec §14/§15).
//
// This Server Component does all the data work; MetricsClient owns the
// period toggle + loading transition. loadCompanyAnalytics is called
// in-process, not via the E2 HTTP route.
export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const [{ days: daysParam }, supabase, t, locale] = await Promise.all([
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

  const rangeValue = daysParam === "7" || daysParam === "90" ? daysParam : DEFAULT_RANGE_DAYS;
  const rangeDays = Number(rangeValue) || 30;
  const granularity = rangeDays >= 90 ? "week" : "day";
  const timezone = company.timezone && company.timezone.length > 0 ? company.timezone : null;
  const to = localToday(timezone ?? "UTC");
  const from = addDays(to, -(rangeDays - 1));

  const [analytics, { data: agentRowsRaw }] = await Promise.all([
    loadCompanyAnalytics({ supabase, companyId: company.id, timezone, granularity, from, to }),
    supabase.from("company_agents").select("status, name, agents(slug)").eq("company_id", company.id),
  ]);

  // PostgREST returns `agents` as one embedded object for this to-one
  // relation; the generated types widen it to an array (see my-agents/page).
  const agentRows = (agentRowsRaw ?? []) as unknown as {
    status: string;
    name: string | null;
    agents: { slug: string } | null;
  }[];
  const teamMember = agentRows.find((r) => r.agents?.slug === "malu") ?? agentRows[0] ?? null;
  const agentName = teamMember?.name ?? defaultAgentName(teamMember?.agents?.slug ?? "malu");

  const byMetric = new Map(analytics.metrics.map((m) => [m.metric, m]));
  const conversationsTotal = byMetric.get("conversations")?.total ?? 0;

  let healthState: HealthState;
  if (!teamMember) healthState = "not_hired";
  else if (teamMember.status === "paused") healthState = "paused";
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

  const cards: MetricCardData[] = METRIC_ORDER.map(({ key, i18n }) => {
    const m = byMetric.get(key);
    return {
      key,
      label: t(`metrics.${i18n}.label`),
      caption: t(`metrics.${i18n}.caption`),
      value: numberFormat.format(m?.total ?? 0),
      series: m?.series.map((p) => p.count) ?? [],
    };
  });

  return (
    <Suspense fallback={null}>
      <MetricsClient
        rangeValue={rangeValue}
        header={{ title: t("pageTitle"), subtitle: t("pageSubtitle") }}
        overview={{ title: t("overviewTitle"), subtitle: t("overviewSubtitle") }}
        rangeLabels={{
          "7": t("range.last7Days"),
          "30": t("range.last30Days"),
          "90": t("range.last90Days"),
        }}
        rangeGroupLabel={t("range.label")}
        cards={cards}
        notASale={t("notASale")}
        health={{
          state: healthState,
          title: HEALTH_COPY[healthState].title,
          body: HEALTH_COPY[healthState].body,
          cta:
            healthState === "not_hired"
              ? { href: "/dashboard", label: t("health.notHiredCta") }
              : undefined,
        }}
      />
    </Suspense>
  );
}
