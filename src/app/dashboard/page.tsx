import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentDescription } from "@/lib/agents/copy";
import { isBillingActive } from "@/lib/billing/activation";
import { agentPhoto } from "@/lib/agents/media";
import { MarketplaceGrid } from "./marketplace-grid";
import type { MarketplaceAgent } from "./agent-card";
import { PageHeader } from "./page-header";
import { SearchIcon } from "@/components/ui/icons";

export default async function MarketplacePage() {
  const supabase = await createClient();
  const t = await getTranslations("Marketplace");

  const [{ data: companies }, { data: agents }] = await Promise.all([
    supabase.from("companies").select("id"),
    supabase
      .from("agents")
      .select("id, slug, role, description")
      .eq("is_active", true)
      .order("created_at"),
  ]);
  const company = companies?.[0] ?? null;

  let hiredAgentIds = new Set<string>();
  let billingActive = false;
  if (company) {
    const [{ data: companyAgents }, active] = await Promise.all([
      supabase.from("company_agents").select("agent_id").eq("company_id", company.id),
      isBillingActive(company.id, supabase),
    ]);
    hiredAgentIds = new Set((companyAgents ?? []).map((ca) => ca.agent_id as string));
    billingActive = active;
  }

  const cards: MarketplaceAgent[] = await Promise.all(
    (agents ?? []).map(async (agent) => {
      return {
        slug: agent.slug,
        name: defaultAgentName(agent.slug),
        role: agent.role ?? "",
        description: await resolveAgentDescription(
          agent.slug,
          agent.description,
          defaultAgentName(agent.slug),
        ),
        isHired: hiredAgentIds.has(agent.id),
        photoSrc: agentPhoto(agent.slug),
      };
    }),
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={SearchIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />
      <MarketplaceGrid agents={cards} billingActive={billingActive} />
    </div>
  );
}
