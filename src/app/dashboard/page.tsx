import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentDescription } from "@/lib/agents/copy";
import { isBillingActive, isBillingPastDue, isSilentForNoPlan } from "@/lib/billing/activation";
import { getUsageSummary } from "@/lib/billing/usage-summary";
import { agentPhoto, resolveAgentPhoto } from "@/lib/agents/media";
import { StatusBanner } from "@/components/ui/status-banner";
import { getTeamActivity, type TeamActivity } from "@/lib/agents/team-activity";
import { HireCard, TeamBadge, type TeamMember } from "./team-badge";

const BANNER_ACTION = {
  primary:
    "inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-label-md font-semibold text-on-primary shadow-[0_8px_20px_-10px_rgba(53,37,205,0.7)] transition-[filter] duration-150 hover:brightness-110",
  danger:
    "inline-flex min-h-11 items-center justify-center rounded-xl bg-error px-5 text-label-md font-semibold text-on-error transition-[filter] duration-150 hover:brightness-95",
};

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
    supabase.from("agents").select("id, slug, role, description").eq("is_active", true).order("created_at"),
  ]);
  const company = companies?.[0] ?? null;

  let hiredByAgentId = new Map<string, HiredAgentRow>();
  let activityByAgentId = new Map<string, TeamActivity>();
  let billingActive = false;
  let pastDue = false;
  let silentForNoPlan = false;
  let overLimit = false;
  let nearLimit = false;
  let repliesLeft = 0;

  if (company) {
    const [{ data: companyAgents }, active, lapsed, usage, activity, noPlanSilence] = await Promise.all([
      supabase
        .from("company_agents")
        .select("agent_id, status, name, photo_type, photo_asset_url")
        .eq("company_id", company.id),
      isBillingActive(company.id, supabase),
      isBillingPastDue(company.id, supabase),
      getUsageSummary(company.id, supabase),
      getTeamActivity(supabase, company.id),
      isSilentForNoPlan(company.id, supabase),
    ]);
    silentForNoPlan = noPlanSilence;
    activityByAgentId = activity;
    hiredByAgentId = new Map(((companyAgents as HiredAgentRow[] | null) ?? []).map((ca) => [ca.agent_id, ca]));
    billingActive = active;
    pastDue = lapsed;

    if (usage && usage.limit > 0) {
      const pct = (usage.used / usage.limit) * 100;
      overLimit = usage.used >= usage.limit;
      nearLimit = !overLimit && pct >= 80;
      repliesLeft = Math.max(0, usage.limit - usage.used);
    }
  }

  const members: (TeamMember & { agentId: string })[] = await Promise.all(
    (agents ?? []).map(async (agent) => {
      const hired = hiredByAgentId.get(agent.id);
      const status: TeamMember["status"] = !hired ? "available" : hired.status === "active" ? "active" : "paused";
      return {
        agentId: agent.id,
        slug: agent.slug,
        name: hired?.name ?? defaultAgentName(agent.slug),
        role: agent.role ?? "",
        description: await resolveAgentDescription(agent.slug, agent.description, defaultAgentName(agent.slug)),
        photoSrc: hired
          ? resolveAgentPhoto(agent.slug, hired.photo_type, hired.photo_asset_url)
          : agentPhoto(agent.slug),
        status,
      };
    }),
  );
  const hiredMembers = members.filter((m) => m.status !== "available");
  const availableMembers = members.filter((m) => m.status === "available");
  const noActivity: TeamActivity = { conversations: 0, needsYou: 0 };

  return (
    <div className="flex flex-col gap-8">
      <h1 className="sr-only">{t("pageTitle")}</h1>

      {pastDue ? (
        <StatusBanner
          tone="error"
          title={t("pastDueBanner.title")}
          body={t("pastDueBanner.body")}
          action={
            <Link href="/dashboard/settings/billing" className={BANNER_ACTION.danger}>
              {t("pastDueBanner.action")}
            </Link>
          }
        />
      ) : overLimit ? (
        <StatusBanner
          tone="error"
          title={t("overLimitBanner.title")}
          body={t("overLimitBanner.body")}
          action={
            <Link href="/dashboard/settings/billing" className={BANNER_ACTION.danger}>
              {t("overLimitBanner.action")}
            </Link>
          }
        />
      ) : nearLimit ? (
        <StatusBanner
          tone="warn"
          title={t("nearLimitBanner.title")}
          body={t("nearLimitBanner.body", { left: repliesLeft })}
          action={
            <Link href="/dashboard/settings/billing" className={BANNER_ACTION.primary}>
              {t("nearLimitBanner.action")}
            </Link>
          }
        />
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-headline-md font-semibold tracking-tight text-on-surface">{t("team.title")}</h2>
        {hiredMembers.length > 0 ? (
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            {hiredMembers.map((member, index) => (
              <TeamBadge
                key={member.slug}
                member={member}
                activity={activityByAgentId.get(member.agentId) ?? noActivity}
                index={index}
                silenced={pastDue || silentForNoPlan}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-outline-variant px-6 py-10 text-center">
            <p className="text-base font-semibold text-on-surface">{t("team.emptyTitle")}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-on-surface-variant">{t("team.emptyBody")}</p>
          </div>
        )}
      </section>

      {availableMembers.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-on-surface">{t("team.hireTitle")}</h2>
          <div className="flex flex-col gap-4">
            {availableMembers.map((member, index) => (
              <HireCard
                key={member.slug}
                member={member}
                billingActive={billingActive}
                pastDue={pastDue}
                index={hiredMembers.length + index}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
