import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { HIREABLE_AGENTS } from "@/lib/agents/catalog";
import { BackLink } from "../../back-link";
import { AgentHireFlow } from "./agent-hire-flow";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentSlug: string }>;
}) {
  const { agentSlug } = await params;
  const catalog = HIREABLE_AGENTS[agentSlug];
  if (!catalog) notFound();

  const supabase = await createClient();
  const t = await getTranslations("Marketplace");

  // agent lookup and the company list don't depend on each other.
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

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard">{t("backToMarketplace")}</BackLink>

      <AgentHireFlow
        agentSlug={agent.slug}
        name={defaultAgentName(agent.slug)}
        role={agent.role ?? ""}
        description={agent.description ?? ""}
        catalog={catalog}
        companyId={company?.id ?? null}
        initialIsHired={isHired}
      />
    </div>
  );
}
