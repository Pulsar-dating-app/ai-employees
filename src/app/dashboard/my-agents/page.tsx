import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { Button } from "@/components/ui/button";
import { CARD_SHADOW, CARD_SHADOW_HOVER } from "@/components/ui/card";
import { UsersIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";

type HiredAgentRow = {
  status: string;
  agents: { slug: string; role: string | null } | null;
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
      .select("status, agents(slug, role)")
      .eq("company_id", company.id);
    hired = (data as HiredAgentRow[] | null) ?? [];
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={UsersIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      {hired.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-neutral-300 p-8">
          <p className="text-sm text-neutral-600">{t("emptyState")}</p>
          <Link href="/dashboard">
            <Button type="button">{t("browseMarketplace")}</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {hired.map((row, index) =>
            row.agents ? (
              <Link
                key={row.agents.slug}
                href={`/dashboard/my-agents/${row.agents.slug}`}
                style={{ animationDelay: `${index * 80}ms` }}
                className={`animate-fade-up flex items-center gap-4 rounded-lg border border-neutral-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-400 ${CARD_SHADOW} ${CARD_SHADOW_HOVER}`}
              >
                <AgentAvatar role="intent" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-neutral-900">
                    {defaultAgentName(row.agents.slug)}
                  </span>
                  <span className="text-sm text-neutral-500">{row.agents.role}</span>
                </div>
                <span className="ml-auto text-sm font-medium text-accent-600">{t("configure")}</span>
              </Link>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
