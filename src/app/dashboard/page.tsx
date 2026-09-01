import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { AGENT_ENRICHMENT, DEFAULT_MONTHLY_PRICE_BRL } from "@/lib/agents/catalog";
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
  if (company) {
    const { data: companyAgents } = await supabase
      .from("company_agents")
      .select("agent_id")
      .eq("company_id", company.id);
    hiredAgentIds = new Set((companyAgents ?? []).map((ca) => ca.agent_id as string));
  }

  const cards: MarketplaceAgent[] = (agents ?? []).map((agent) => {
    const enrichment = AGENT_ENRICHMENT[agent.slug];
    return {
      slug: agent.slug,
      name: defaultAgentName(agent.slug),
      role: agent.role ?? "",
      description: agent.description ?? "",
      monthlyPriceBRL: enrichment?.monthlyPriceBRL ?? DEFAULT_MONTHLY_PRICE_BRL,
      isHired: hiredAgentIds.has(agent.id),
      photoSrc: agentPhoto(agent.slug),
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={SearchIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />
      <MarketplaceGrid agents={cards} />
    </div>
  );
}
