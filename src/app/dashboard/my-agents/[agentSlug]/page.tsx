import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentPhoto } from "@/lib/agents/media";
import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";
import { Button } from "@/components/ui/button";
import { BackLink } from "../../back-link";
import { AgentPersonaCard } from "../agent-persona-card";
import { WebChatChannelCard } from "./web-chat-channel-card";
import { DevChatTest } from "../../dev-chat-test";

// A hired team member's own page is scoped to *how customers reach them* —
// platform connections only. Business knowledge is company-wide, not
// per-agent, and lives at /dashboard/settings instead.
//
// The WhatsApp card (`channels-section.tsx`) is deliberately NOT rendered
// here: as of 2026-08-31 Instagram replaces WhatsApp as the messaging
// channel we're building (epic N). D1's backend, its migrations and
// `channels-section.tsx` itself all stay in the tree, dormant and
// unreferenced, so re-mounting one JSX line brings the whole flow back if
// that decision reverses — nothing about it was deleted.
export default async function AgentConnectionsPage({
  params,
}: {
  params: Promise<{ agentSlug: string }>;
}) {
  const { agentSlug } = await params;
  const supabase = await createClient();
  const t = await getTranslations("MyAgents");

  const [{ data: agent }, { data: companies }] = await Promise.all([
    supabase
      .from("agents")
      .select("id, slug, role, description")
      .eq("slug", agentSlug)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.from("companies").select("id, slug"),
  ]);
  if (!agent) notFound();
  const company = companies?.[0] ?? null;
  const name = defaultAgentName(agentSlug);

  if (!company) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/dashboard/my-agents">{t("backToMyAgents")}</BackLink>
        <h1 className="text-headline-lg font-semibold text-on-surface">{t("connectionsTitle")}</h1>
        <p className="text-sm text-on-surface-variant">{t("notHired")}</p>
      </div>
    );
  }

  // The caller's `company_users.role` was fetched here too, purely to gate
  // the WhatsApp card's connect/disconnect buttons. Nothing on this page is
  // admin-only while that card is unmounted, so the query goes with it — the
  // Instagram connect card (epic N) brings both back.
  const { data: companyAgent } = await supabase
    .from("company_agents")
    .select("id, status")
    .eq("company_id", company.id)
    .eq("agent_id", agent.id)
    .maybeSingle();

  if (!companyAgent) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/dashboard/my-agents">{t("backToMyAgents")}</BackLink>
        <h1 className="text-headline-lg font-semibold text-on-surface">{t("connectionsTitle")}</h1>
        <p className="text-sm text-on-surface-variant">{t("notHired")}</p>
        <Link href={`/dashboard/agents/${agentSlug}`}>
          <Button type="button">{t("viewAgent", { name })}</Button>
        </Link>
      </div>
    );
  }

  const baseUrl = resolveCheckoutBaseUrl();
  const chatUrl = `${baseUrl}/talk/${company.slug}/${agentSlug}`;
  const embedSnippet = `<script src="${baseUrl}/widget.js" data-company="${company.slug}" data-agent="${agentSlug}"></script>`;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard/my-agents">{t("backToMyAgents")}</BackLink>

      <div>
        <h1 className="text-headline-lg font-semibold text-on-surface">
          {t("connectionsTitle")} — {name}
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {t("connectionsSubtitle", { name })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <AgentPersonaCard
          name={name}
          role={agent.role}
          description={agent.description}
          photoSrc={agentPhoto(agentSlug)}
          active={companyAgent.status === "active"}
          className="lg:col-span-4"
        />
        <div className="flex flex-col gap-6 lg:col-span-8">
          <WebChatChannelCard chatUrl={chatUrl} embedSnippet={embedSnippet} />
          {process.env.NODE_ENV !== "production" ? (
            <DevChatTest companyId={company.id} agentSlug={agentSlug} agentName={name} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
