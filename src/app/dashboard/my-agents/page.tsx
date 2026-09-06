import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isBillingPastDue } from "@/lib/billing/activation";
import { getUsageSummary } from "@/lib/billing/usage-summary";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentPhoto } from "@/lib/agents/media";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { UsersIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { AgentPersonaCard } from "./agent-persona-card";

type HiredAgentRow = {
  status: string;
  name: string | null;
  photo_type: string | null;
  photo_asset_url: string | null;
  agents: { slug: string; role: string | null; description: string | null } | null;
};

export default async function MyAgentsPage() {
  const supabase = await createClient();
  const t = await getTranslations("MyAgents");

  const { data: companies } = await supabase.from("companies").select("id");
  const company = companies?.[0] ?? null;

  let hired: HiredAgentRow[] = [];
  let pastDue = false;
  let overLimit = false;
  let nearLimit = false;
  let repliesLeft = 0;
  if (company) {
    const [{ data }, lapsed, usage] = await Promise.all([
      supabase
        .from("company_agents")
        .select("status, name, photo_type, photo_asset_url, agents(slug, role, description)")
        .eq("company_id", company.id),
      isBillingPastDue(company.id, supabase),
      getUsageSummary(company.id, supabase),
    ]);
    hired = (data as HiredAgentRow[] | null) ?? [];
    pastDue = lapsed;

    if (usage && usage.limit > 0) {
      const pct = (usage.used / usage.limit) * 100;
      overLimit = usage.used >= usage.limit;
      nearLimit = !overLimit && pct >= 80;
      repliesLeft = Math.max(0, usage.limit - usage.used);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={UsersIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      {/* Each card below still reads active/paused off company_agents.status
          (the K6 toggle) alone, so it keeps showing "answering" through a
          payment failure -- the reply gate is what actually silences
          replies, not this per-card badge. This banner is the one place on
          the team's own page that says so explicitly. */}
      {/* Payment failure already silences every bot regardless of usage (P4's
          gate runs before P7's), so it takes priority and the two banners
          never stack -- only one of the three shows at a time. */}
      {pastDue ? (
        <Alert
          variant="error"
          title={t("pastDueBanner.title")}
          action={
            <Link href="/dashboard/settings/billing">
              <Button type="button" variant="danger" size="sm">
                {t("pastDueBanner.action")}
              </Button>
            </Link>
          }
        >
          {t("pastDueBanner.body")}
        </Alert>
      ) : overLimit ? (
        <Alert
          variant="error"
          title={t("overLimitBanner.title")}
          action={
            <Link href="/dashboard/settings/billing">
              <Button type="button" variant="danger" size="sm">
                {t("overLimitBanner.action")}
              </Button>
            </Link>
          }
        >
          {t("overLimitBanner.body")}
        </Alert>
      ) : nearLimit ? (
        <Alert
          variant="warning"
          title={t("nearLimitBanner.title")}
          action={
            <Link href="/dashboard/settings/billing">
              <Button type="button" variant="primary" size="sm">
                {t("nearLimitBanner.action")}
              </Button>
            </Link>
          }
        >
          {t("nearLimitBanner.body", { left: repliesLeft })}
        </Alert>
      ) : null}

      {hired.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-outline-variant p-8">
          <p className="text-sm text-on-surface-variant">{t("emptyState")}</p>
          <Link href="/dashboard">
            <Button type="button">{t("browseMarketplace")}</Button>
          </Link>
        </div>
      ) : (
        <div className="grid max-w-4xl grid-cols-1 gap-5">
          {hired.map((row) =>
            row.agents ? (
              <Link
                key={row.agents.slug}
                href={`/dashboard/my-agents/${row.agents.slug}`}
                className="transition-transform duration-200 hover:-translate-y-0.5"
              >
                <AgentPersonaCard
                  slug={row.agents.slug}
                  name={row.name ?? defaultAgentName(row.agents.slug)}
                  role={row.agents.role}
                  description={row.agents.description}
                  photoSrc={resolveAgentPhoto(row.agents.slug, row.photo_type, row.photo_asset_url)}
                  active={row.status === "active"}
                  className="h-full transition-shadow hover:shadow-level2"
                />
              </Link>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
