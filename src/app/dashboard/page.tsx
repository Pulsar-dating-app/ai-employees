import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { HIREABLE_AGENTS, LOCKED_AGENTS } from "@/lib/agents/catalog";
import { HireableAgentCard, LockedAgentCard } from "./agent-card";
import { PageHeader } from "./page-header";
import { GridIcon } from "@/components/ui/icons";

export default async function MarketplacePage() {
  const supabase = await createClient();
  const t = await getTranslations("Marketplace");
  const tLocked = await getTranslations("Marketplace.lockedAgents");
  const tTraits = await getTranslations("Marketplace.traits");

  // companies/agents don't depend on each other — fire both at once instead
  // of paying two sequential round-trips to the remote Supabase project.
  const [{ data: companies }, { data: agents }] = await Promise.all([
    supabase.from("companies").select("id"),
    supabase.from("agents").select("id, slug, role").eq("is_active", true),
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

  const malu = (agents ?? []).find((a) => a.slug === "malu");
  const maluCatalog = HIREABLE_AGENTS.malu;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={GridIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {malu ? (
          <HireableAgentCard
            slug={malu.slug}
            name={defaultAgentName(malu.slug)}
            role={malu.role ?? ""}
            traits={maluCatalog.traits.map((trait) => tTraits(trait))}
            monthlyPriceBRL={maluCatalog.monthlyPriceBRL}
            isHired={hiredAgentIds.has(malu.id)}
            style={{ animationDelay: "0ms" }}
          />
        ) : null}

        {LOCKED_AGENTS.map((agent, index) => (
          <LockedAgentCard
            key={agent.slug}
            name={tLocked(`${agent.slug}.name`)}
            role={tLocked(`${agent.slug}.role`)}
            style={{ animationDelay: `${(index + 1) * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
