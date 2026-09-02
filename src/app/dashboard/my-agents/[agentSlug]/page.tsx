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
import { PolicySection } from "../../settings/policy-section";
import { WebChatChannelCard } from "./web-chat-channel-card";
import { WidgetCustomizeCard } from "./widget-customize-card";
import { InstagramConnectCard } from "./instagram-connect-card";
import { AvailabilityCard } from "./availability-card";
import { NameCard } from "./name-card";
import { HumanHandoffCard } from "./human-handoff-card";
import { DevChatTest } from "../../dev-chat-test";
import { AgentConnectionsTour } from "./agent-connections-tour";

// A hired team member's own page is scoped to *how customers reach them* —
// platform connections only. Business knowledge is company-wide, not
// per-agent, and lives at /dashboard/settings instead.
//
// Deliberate exception: Shipping/Returns render here too, Malu-only. Both
// are still plain `companies` columns (shipping_policy/return_policy),
// still edited via `PolicySection` (reused unchanged from Settings, same
// PATCH /api/companies/[companyId] endpoint, same translations) — nothing
// moved at the data layer, only where the same component is mounted.
// User-driven: this content is only ever relevant to Malu's own sales
// conversations, never Ana's scheduling ones, so surfacing it on a page
// Ana's own hire also reaches (this one, gated by agentSlug) would be
// actively misleading. Payment/Other policy stay on Settings — genuinely
// company-wide, not agent-specific in the same way.
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
    supabase.from("companies").select("id, slug, allow_human_handoff, shipping_policy, return_policy"),
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
      <AgentConnectionsTour agentName={name} />
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
          <div data-tour="agent-name">
            <NameCard
              companyId={company.id}
              agentSlug={agentSlug}
              initialName={name}
              defaultName={fallbackName}
              canEdit={canEdit}
            />
          </div>
          <AvailabilityCard
            companyId={company.id}
            agentSlug={agentSlug}
            agentName={name}
            initialActive={companyAgent.status === "active"}
            canEdit={canEdit}
          />
          {agentSlug === "malu" ? (
            <>
              <PolicySection
                companyId={company.id}
                fieldName="shipping_policy"
                sectionKey="shipping"
                initialValue={company.shipping_policy}
                canEdit={canEdit}
              />
              <PolicySection
                companyId={company.id}
                fieldName="return_policy"
                sectionKey="returns"
                initialValue={company.return_policy}
                canEdit={canEdit}
              />
            </>
          ) : null}
          <div data-tour="human-handoff">
            <HumanHandoffCard
              companyId={company.id}
              agentName={name}
              canEdit={canEdit}
              initialAllowHumanHandoff={company.allow_human_handoff}
            />
          </div>
          <div data-tour="instagram-connect">
            <Suspense fallback={null}>
              <InstagramConnectCard companyId={company.id} agentSlug={agentSlug} canEdit={canEdit} />
            </Suspense>
          </div>
          <div data-tour="embed-customize">
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
          </div>
          <div data-tour="share-links">
            <WebChatChannelCard agentName={name} chatUrl={chatUrl} embedSnippet={embedSnippet} />
          </div>
          {process.env.NODE_ENV !== "production" ? (
            <DevChatTest companyId={company.id} agentSlug={agentSlug} agentName={name} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
