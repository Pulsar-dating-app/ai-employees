import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isBillingPastDue } from "@/lib/billing/activation";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentPhoto } from "@/lib/agents/media";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { UsersIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { AgentPersonaCard } from "./agent-persona-card";

type HiredAgentRow = {
  status: string;
  name: string | null;
  photo_type: string | null;
  photo_asset_url: string | null;
  agents: { slug: string; role: string | null; description: string | null } | null;
};

export default async function MyAgentsPage() {
  const supabase = await createClient();
  const t = await getTranslations("MyAgents");

  const { data: companies } = await supabase.from("companies").select("id");
  const company = companies?.[0] ?? null;

  let hired: HiredAgentRow[] = [];
  let pastDue = false;
  if (company) {
    const [{ data }, lapsed] = await Promise.all([
      supabase
        .from("company_agents")
        .select("status, name, photo_type, photo_asset_url, agents(slug, role, description)")
        .eq("company_id", company.id),
      isBillingPastDue(company.id, supabase),
    ]);
    hired = (data as HiredAgentRow[] | null) ?? [];
    pastDue = lapsed;
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={UsersIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      {/* Each card below still reads active/paused off company_agents.status
          (the K6 toggle) alone, so it keeps showing "answering" through a
          payment failure -- the reply gate is what actually silences
          replies, not this per-card badge. This banner is the one place on
          the team's own page that says so explicitly. */}
      {pastDue ? (
        <Alert
          variant="error"
          title={t("pastDueBanner.title")}
          action={
            <Link href="/dashboard/settings/billing">
              <Button type="button" variant="danger" size="sm">
                {t("pastDueBanner.action")}
              </Button>
            </Link>
          }
        >
          {t("pastDueBanner.body")}
        </Alert>
      ) : null}

      {hired.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-outline-variant p-8">
          <p className="text-sm text-on-surface-variant">{t("emptyState")}</p>
          <Link href="/dashboard">
            <Button type="button">{t("browseMarketplace")}</Button>
          </Link>
        </div>
      ) : (
        <div className="grid max-w-4xl grid-cols-1 gap-5">
          {hired.map((row) =>
            row.agents ? (
              <Link
                key={row.agents.slug}
                href={`/dashboard/my-agents/${row.agents.slug}`}
                className="transition-transform duration-200 hover:-translate-y-0.5"
              >
                <AgentPersonaCard
                  slug={row.agents.slug}
                  name={row.name ?? defaultAgentName(row.agents.slug)}
                  role={row.agents.role}
                  description={row.agents.description}
                  photoSrc={resolveAgentPhoto(row.agents.slug, row.photo_type, row.photo_asset_url)}
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
