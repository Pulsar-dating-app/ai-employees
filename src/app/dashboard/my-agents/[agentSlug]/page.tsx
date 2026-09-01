import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentPhoto } from "@/lib/agents/media";
import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";
import { buildEmbedSnippet } from "@/lib/widget/embed-snippet";
import { Button } from "@/components/ui/button";
import { BackLink } from "../../back-link";
import { AgentPersonaCard } from "../agent-persona-card";
import { WebChatChannelCard } from "./web-chat-channel-card";
import { WidgetCustomizeCard } from "./widget-customize-card";
import { InstagramConnectCard } from "./instagram-connect-card";
import { AvailabilityCard } from "./availability-card";
import { NameCard } from "./name-card";
import { HumanHandoffCard } from "./human-handoff-card";
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

  const [{ data: agent }, { data: companies }, { data: userData }] = await Promise.all([
    supabase
      .from("agents")
      .select("id, slug, role, description")
      .eq("slug", agentSlug)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.from("companies").select("id, slug, allow_human_handoff"),
    supabase.auth.getUser(),
  ]);
  if (!agent) notFound();
  const company = companies?.[0] ?? null;
  const user = userData.user;
  const fallbackName = defaultAgentName(agentSlug);

  if (!company) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/dashboard/my-agents">{t("backToMyAgents")}</BackLink>
        <h1 className="text-headline-lg font-semibold text-on-surface">{t("connectionsTitle")}</h1>
        <p className="text-sm text-on-surface-variant">{t("notHired")}</p>
      </div>
    );
  }

  // The caller's role gates the K6 pause/activate control and the Instagram
  // connect card (both admin-only). Fetched alongside the hire row.
  const [{ data: companyAgent }, { data: membership }] = await Promise.all([
    supabase
      .from("company_agents")
      .select("id, name, status, widget_greeting, widget_launcher_type, widget_launcher_asset_url")
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
        <h1 className="text-headline-lg font-semibold text-on-surface">{t("connectionsTitle")}</h1>
        <p className="text-sm text-on-surface-variant">{t("notHired")}</p>
        <Link href={`/dashboard/agents/${agentSlug}`}>
          <Button type="button">{t("viewAgent", { name: fallbackName })}</Button>
        </Link>
      </div>
    );
  }

  const name = companyAgent.name ?? fallbackName;
  const canEdit = membership ? ["owner", "admin"].includes(membership.role) : false;

  const baseUrl = resolveCheckoutBaseUrl();
  const chatUrl = `${baseUrl}/talk/${company.slug}/${agentSlug}`;
  const embedSnippet = buildEmbedSnippet(baseUrl, company.slug, agentSlug, {
    greeting: companyAgent.widget_greeting,
    launcherType: companyAgent.widget_launcher_type,
    launcherAssetUrl: companyAgent.widget_launcher_asset_url,
  });

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
          <NameCard
            companyId={company.id}
            agentSlug={agentSlug}
            initialName={name}
            defaultName={fallbackName}
            canEdit={canEdit}
          />
          <AvailabilityCard
            companyId={company.id}
            agentSlug={agentSlug}
            agentName={name}
            initialActive={companyAgent.status === "active"}
            canEdit={canEdit}
          />
          <HumanHandoffCard
            companyId={company.id}
            agentName={name}
            canEdit={canEdit}
            initialAllowHumanHandoff={company.allow_human_handoff}
          />
          <Suspense fallback={null}>
            <InstagramConnectCard companyId={company.id} agentSlug={agentSlug} canEdit={canEdit} />
          </Suspense>
          <WidgetCustomizeCard
            companyId={company.id}
            agentSlug={agentSlug}
            agentName={name}
            canEdit={canEdit}
            initial={{
              greeting: companyAgent.widget_greeting,
              launcherType: companyAgent.widget_launcher_type,
              launcherAssetUrl: companyAgent.widget_launcher_asset_url,
            }}
          />
          <WebChatChannelCard agentName={name} chatUrl={chatUrl} embedSnippet={embedSnippet} />
          {process.env.NODE_ENV !== "production" ? (
            <DevChatTest companyId={company.id} agentSlug={agentSlug} agentName={name} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
