import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { Button } from "@/components/ui/button";
import { BackLink } from "../../back-link";
import { ChannelsSection } from "./channels-section";

// A hired team member's own page is scoped to *how customers reach them* —
// platform connections only. Business knowledge is company-wide, not
// per-agent, and lives at /dashboard/settings instead.
export default async function AgentConnectionsPage({
  params,
}: {
  params: Promise<{ agentSlug: string }>;
}) {
  const { agentSlug } = await params;
  const supabase = await createClient();
  const t = await getTranslations("MyAgents");

  // Independent lookups fired together — cuts the round-trips to the
  // remote Supabase project this page needs before it can render anything.
  const [{ data: agent }, { data: companies }, { data: userData }] = await Promise.all([
    supabase.from("agents").select("id, slug, role").eq("slug", agentSlug).eq("is_active", true).maybeSingle(),
    supabase.from("companies").select("id"),
    supabase.auth.getUser(),
  ]);
  if (!agent) notFound();
  const company = companies?.[0] ?? null;
  const user = userData.user;

  if (!company) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/dashboard/my-agents">{t("backToMyAgents")}</BackLink>
        <h1 className="text-2xl font-semibold text-neutral-900">{t("connectionsTitle")}</h1>
        <p className="text-sm text-neutral-600">{t("notHired")}</p>
      </div>
    );
  }

  const [{ data: companyAgent }, { data: membership }] = await Promise.all([
    supabase
      .from("company_agents")
      .select("id")
      .eq("company_id", company.id)
      .eq("agent_id", agent.id)
      .maybeSingle(),
    supabase
      .from("company_users")
      .select("role")
      .eq("company_id", company.id)
      .eq("user_id", user!.id)
      .maybeSingle(),
  ]);

  if (!companyAgent) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/dashboard/my-agents">{t("backToMyAgents")}</BackLink>
        <h1 className="text-2xl font-semibold text-neutral-900">{t("connectionsTitle")}</h1>
        <p className="text-sm text-neutral-600">{t("notHired")}</p>
        <Link href={`/dashboard/agents/${agentSlug}`}>
          <Button type="button">{t("viewAgent", { name: defaultAgentName(agentSlug) })}</Button>
        </Link>
      </div>
    );
  }

  const canEdit = membership ? ["owner", "admin"].includes(membership.role) : false;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard/my-agents">{t("backToMyAgents")}</BackLink>

      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">
          {t("connectionsTitle")} — {defaultAgentName(agentSlug)}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{t("connectionsSubtitle")}</p>
      </div>

      <ChannelsSection
        companyId={company.id}
        canEdit={canEdit}
        metaAppId={process.env.META_APP_ID ?? ""}
        metaConfigId={process.env.META_WHATSAPP_CONFIG_ID ?? ""}
      />
    </div>
  );
}
