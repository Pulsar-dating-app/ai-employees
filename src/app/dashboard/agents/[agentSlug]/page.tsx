import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { AGENT_ENRICHMENT, DEFAULT_MONTHLY_PRICE_BRL } from "@/lib/agents/catalog";
import { agentPhoto } from "@/lib/agents/media";
import { BackLink } from "../../back-link";
import { AgentHireFlow } from "./agent-hire-flow";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentSlug: string }>;
}) {
  const { agentSlug } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Marketplace");

  // Any active `agents` row gets a real detail page — not gated on having
  // a curated catalog entry. agent lookup and the company list don't
  // depend on each other.
  const [{ data: agent }, { data: companies }] = await Promise.all([
    supabase
      .from("agents")
      .select("id, slug, role, description")
      .eq("slug", agentSlug)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.from("companies").select("id"),
  ]);
  if (!agent) notFound();
  const company = companies?.[0] ?? null;

  let isHired = false;
  if (company) {
    const { data: companyAgent } = await supabase
      .from("company_agents")
      .select("id")
      .eq("company_id", company.id)
      .eq("agent_id", agent.id)
      .maybeSingle();
    isHired = Boolean(companyAgent);
  }

  const enrichment = AGENT_ENRICHMENT[agent.slug];

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard">{t("backToMarketplace")}</BackLink>

      <AgentHireFlow
        agentSlug={agent.slug}
        name={defaultAgentName(agent.slug)}
        role={agent.role ?? ""}
        description={agent.description ?? ""}
        photoSrc={agentPhoto(agent.slug)}
        traits={enrichment?.traits ?? []}
        should={enrichment?.should ?? []}
        never={enrichment?.never ?? []}
        monthlyPriceBRL={enrichment?.monthlyPriceBRL ?? DEFAULT_MONTHLY_PRICE_BRL}
        companyId={company?.id ?? null}
        initialIsHired={isHired}
      />
    </div>
  );
}
