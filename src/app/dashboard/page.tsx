import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { AGENT_ENRICHMENT, DEFAULT_MONTHLY_PRICE_BRL } from "@/lib/agents/catalog";
import { HireableAgentCard } from "./agent-card";
import { PageHeader } from "./page-header";
import { GridIcon } from "@/components/ui/icons";

export default async function MarketplacePage() {
  const supabase = await createClient();
  const t = await getTranslations("Marketplace");
  const tTraits = await getTranslations("Marketplace.traits");

  // companies/agents don't depend on each other — fire both at once instead
  // of paying two sequential round-trips to the remote Supabase project.
  const [{ data: companies }, { data: agents }] = await Promise.all([
    supabase.from("companies").select("id"),
    supabase.from("agents").select("id, slug, role").eq("is_active", true).order("created_at"),
  ]);
  const company = companies?.[0] ?? null;

  let hiredAgentIds = new Set<string>();
  if (company) {
    const { data: companyAgents } = await supabase
      .from("company_agents")
      .select("agent_id")
      .eq("company_id", company.id);
    hiredAgentIds = new Set((companyAgents ?? []).map((ca) => ca.agent_id as string));
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={GridIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(agents ?? []).map((agent, index) => {
          const enrichment = AGENT_ENRICHMENT[agent.slug];
          return (
            <HireableAgentCard
              key={agent.id}
              slug={agent.slug}
              name={defaultAgentName(agent.slug)}
              role={agent.role ?? ""}
              traits={(enrichment?.traits ?? []).map((trait) => tTraits(trait))}
              monthlyPriceBRL={enrichment?.monthlyPriceBRL ?? DEFAULT_MONTHLY_PRICE_BRL}
              isHired={hiredAgentIds.has(agent.id)}
              style={{ animationDelay: `${index * 80}ms` }}
            />
          );
        })}
      </div>
    </div>
  );
}
