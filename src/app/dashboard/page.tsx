import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { StepBadge } from "@/components/ui/step-badge";
import { HireTeamCard } from "./hire-team-card";

function LinkStepCard({
  title,
  description,
  status,
  href,
}: {
  title: string;
  description: string;
  status: "active" | "done";
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="transition-colors hover:bg-neutral-50">
        <CardHeader>
          <div className="flex flex-row items-center gap-3">
            <StepBadge status={status} />
            <CardTitle>{title}</CardTitle>
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

type CompanyAgentRow = {
  agent_id: string;
};

type AgentRow = {
  id: string;
  slug: string;
  role: string | null;
  description: string | null;
};

function StubStepCard({
  title,
  description,
  comingSoonLabel,
}: {
  title: string;
  description: string;
  comingSoonLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="flex flex-row items-center gap-3">
            <StepBadge status="locked" />
            <CardTitle>{title}</CardTitle>
          </div>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500">
            {comingSoonLabel}
          </span>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const t = await getTranslations("Dashboard");

  const { data: companies } = await supabase.from("companies").select("*");
  const company = companies?.[0] ?? null;

  const { data: agents } = await supabase
    .from("agents")
    .select("id, slug, role, description")
    .eq("is_active", true)
    .order("slug");

  let hiredAgentIds = new Set<string>();
  let hasProducts = false;
  if (company) {
    const { data: companyAgents } = await supabase
      .from("company_agents")
      .select("agent_id")
      .eq("company_id", company.id);
    hiredAgentIds = new Set((companyAgents as CompanyAgentRow[] | null)?.map((ca) => ca.agent_id) ?? []);

    const { data: existingProducts } = await supabase
      .from("products")
      .select("id")
      .eq("company_id", company.id)
      .limit(1);
    // Any product ever added counts, active or not — a merchant who
    // deactivated everything has still done catalog work, same "ever set"
    // spirit as hasKnowledge below rather than "currently non-empty."
    hasProducts = (existingProducts?.length ?? 0) > 0;
  }

  const allAgents = (agents as AgentRow[] | null) ?? [];
  const hiredAgents = allAgents.filter((a) => hiredAgentIds.has(a.id));
  const availableAgents = allAgents
    .filter((a) => !hiredAgentIds.has(a.id))
    .map((a) => ({
      id: a.id,
      slug: a.slug,
      displayName: defaultAgentName(a.slug),
      role: a.role,
      description: a.description,
    }));

  const hasKnowledge = Boolean(
    company?.description ||
      company?.shipping_policy ||
      company?.return_policy ||
      company?.payment_policy ||
      company?.additional_information ||
      (Array.isArray(company?.faq) && company.faq.length > 0),
  );

  const completedSteps = (hiredAgents.length > 0 ? 1 : 0) + (hasKnowledge ? 1 : 0);
  const totalSteps = 4;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{t("welcomeTitle")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("welcomeSubtitle")}</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-neutral-700">
          {t("stepProgress", { completed: completedSteps, total: totalSteps })}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-accent-500 transition-all"
            style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {hiredAgents.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-neutral-700">{t("hiredSectionTitle")}</p>
            {hiredAgents.map((agent) => (
              <Card key={agent.id}>
                <CardContent className="flex flex-row items-center gap-3">
                  <StepBadge status="done" />
                  <div>
                    <div className="flex flex-row items-baseline gap-2">
                      <CardTitle>{defaultAgentName(agent.slug)}</CardTitle>
                      {agent.role ? (
                        <span className="text-xs font-medium text-neutral-500">{agent.role}</span>
                      ) : null}
                    </div>
                    <CardDescription>{t("hiredBadge")}</CardDescription>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        {availableAgents.length > 0 ? (
          <HireTeamCard
            // Remount whenever the available set changes (e.g. right after a
            // hire) so the card's local selection state can't go stale and
            // reference an agent that's no longer in the list.
            key={availableAgents.map((a) => a.id).join(",")}
            availableAgents={availableAgents}
            companyId={company?.id ?? null}
          />
        ) : null}

        <LinkStepCard
          title={t("teachTitle")}
          description={t("teachDescription")}
          status={hasKnowledge ? "done" : "active"}
          href="/dashboard/teach"
        />

        <LinkStepCard
          title={t("productsTitle")}
          description={t("productsDescription")}
          status={hasProducts ? "done" : "active"}
          href="/dashboard/products"
        />

        {process.env.NODE_ENV !== "production" ? (
          // TODO(D1-TEST-ONLY): revert to the plain <StubStepCard> below
          // once F4 ships the real connection screen (and delete
          // dev-whatsapp-connect-test alongside it). Links to the
          // throwaway Embedded Signup test harness instead of the real stub
          // so the connect flow can be exercised from the dashboard during
          // dev. Never renders in production.
          <LinkStepCard
            title={t("connectTitle")}
            description={t("connectDescription")}
            status="active"
            href="/dashboard/dev-whatsapp-connect-test"
          />
        ) : (
          <StubStepCard
            title={t("connectTitle")}
            description={t("connectDescription")}
            comingSoonLabel={t("comingSoon")}
          />
        )}

        <StubStepCard
          title={t("readyTitle")}
          description={t("readyDescription")}
          comingSoonLabel={t("comingSoon")}
        />
      </div>
    </div>
  );
}
