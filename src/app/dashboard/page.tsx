import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentDescription } from "@/lib/agents/copy";
import { isBillingActive, isBillingPastDue } from "@/lib/billing/activation";
import { getUsageSummary } from "@/lib/billing/usage-summary";
import { agentPhoto, resolveAgentPhoto } from "@/lib/agents/media";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TeamGrid } from "./team-grid";
import type { TeamAgent, TeamAgentStatus } from "./agent-card";
import { PageHeader } from "./page-header";
import { UsersIcon } from "@/components/ui/icons";

// Trello P6 removed per-agent pricing (every hired agent is covered by one
// company-wide plan, a shared reply quota) -- once price stopped being a
// reason to browse agents separately from managing them, having two
// top-level destinations (Marketplace to browse/hire, My Team to manage)
// for what's really one list stopped making sense. Merged here (2026-09-10):
// this single page shows every catalog agent -- active, paused, or
// available (never hired) -- see the 2026-09-10 decisions.md entry.
//
// Kept at `/dashboard` specifically: it's already what a brand-new
// company's onboarding redirects to, and what Metrics' LockedPage CTA links
// to when zero agents are hired -- keeping the URL here means neither needs
// to change.
type HiredAgentRow = {
  agent_id: string;
  status: string;
  name: string | null;
  photo_type: string | null;
  photo_asset_url: string | null;
};

export default async function MyTeamPage() {
  const supabase = await createClient();
  const t = await getTranslations("MyAgents");

  const [{ data: companies }, { data: agents }] = await Promise.all([
    supabase.from("companies").select("id"),
    supabase
      .from("agents")
      .select("id, slug, role, description")
      .eq("is_active", true)
      .order("created_at"),
  ]);
  const company = companies?.[0] ?? null;

  let hiredByAgentId = new Map<string, HiredAgentRow>();
  let billingActive = false;
  let pastDue = false;
  let overLimit = false;
  let nearLimit = false;
  let repliesLeft = 0;

  if (company) {
    const [{ data: companyAgents }, active, lapsed, usage] = await Promise.all([
      supabase
        .from("company_agents")
        .select("agent_id, status, name, photo_type, photo_asset_url")
        .eq("company_id", company.id),
      isBillingActive(company.id, supabase),
      isBillingPastDue(company.id, supabase),
      getUsageSummary(company.id, supabase),
    ]);
    hiredByAgentId = new Map(
      ((companyAgents as HiredAgentRow[] | null) ?? []).map((ca) => [ca.agent_id, ca]),
    );
    billingActive = active;
    pastDue = lapsed;

    if (usage && usage.limit > 0) {
      const pct = (usage.used / usage.limit) * 100;
      overLimit = usage.used >= usage.limit;
      nearLimit = !overLimit && pct >= 80;
      repliesLeft = Math.max(0, usage.limit - usage.used);
    }
  }

  const cards: TeamAgent[] = await Promise.all(
    (agents ?? []).map(async (agent) => {
      const hired = hiredByAgentId.get(agent.id);
      const status: TeamAgentStatus = !hired ? "available" : hired.status === "active" ? "active" : "paused";
      return {
        slug: agent.slug,
        name: hired?.name ?? defaultAgentName(agent.slug),
        role: agent.role ?? "",
        description: await resolveAgentDescription(
          agent.slug,
          agent.description,
          defaultAgentName(agent.slug),
        ),
        photoSrc: hired
          ? resolveAgentPhoto(agent.slug, hired.photo_type, hired.photo_asset_url)
          : agentPhoto(agent.slug),
        status,
      };
    }),
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={UsersIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      {/* Same three-way banner My Team's own page used to show, ported
          verbatim -- real billing-health UI, must not be lost in the merge. */}
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

      <TeamGrid agents={cards} billingActive={billingActive} />
    </div>
  );
}
