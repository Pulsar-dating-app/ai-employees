import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentPhoto } from "@/lib/agents/media";
import { Button } from "@/components/ui/button";
import { UsersIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { AgentPersonaCard } from "./agent-persona-card";

type HiredAgentRow = {
  status: string;
  name: string | null;
  agents: { slug: string; role: string | null; description: string | null } | null;
};

export default async function MyAgentsPage() {
  const supabase = await createClient();
  const t = await getTranslations("MyAgents");

  const { data: companies } = await supabase.from("companies").select("id");
  const company = companies?.[0] ?? null;

  let hired: HiredAgentRow[] = [];
  if (company) {
    const { data } = await supabase
      .from("company_agents")
      .select("status, name, agents(slug, role, description)")
      .eq("company_id", company.id);
    hired = (data as HiredAgentRow[] | null) ?? [];
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={UsersIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      {hired.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-outline-variant p-8">
          <p className="text-sm text-on-surface-variant">{t("emptyState")}</p>
          <Link href="/dashboard">
            <Button type="button">{t("browseMarketplace")}</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {hired.map((row) =>
            row.agents ? (
              <Link
                key={row.agents.slug}
                href={`/dashboard/my-agents/${row.agents.slug}`}
                className="transition-transform duration-200 hover:-translate-y-0.5"
              >
                <AgentPersonaCard
                  name={row.name ?? defaultAgentName(row.agents.slug)}
                  role={row.agents.role}
                  description={row.agents.description}
                  photoSrc={agentPhoto(row.agents.slug)}
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
