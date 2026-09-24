import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentDefaultPhotos, resolveAgentPhoto } from "@/lib/agents/media";
import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";
import { buildEmbedSnippet } from "@/lib/widget/embed-snippet";
import { findPlan } from "@/lib/billing/plans";
import { decideWhatsappPlanGate } from "@/lib/whatsapp/enforcement";
import { Button } from "@/components/ui/button";
import { BackLink } from "../../back-link";
import { resolveAgentDescription } from "@/lib/agents/copy";
import { PolicySection } from "../../settings/policy-section";
import { ChannelHub } from "./channel-hub";
import { TutorialVideoCard } from "./tutorial-video-card";
import { AgentHero } from "./agent-hero";
import { HumanHandoffCard } from "./human-handoff-card";
import { AgentConnectionsTour } from "./agent-connections-tour";
import { SchedulingSetupCard } from "./scheduling-setup-card";
import { loadSchedulingSetup } from "@/lib/scheduling/setup";

export default async function AgentConnectionsPage({ params }: { params: Promise<{ agentSlug: string }> }) {
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
    supabase
      .from("companies")
      .select("id, slug, allow_human_handoff, shipping_policy, return_policy, allowed_embed_domains"),
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

  const [{ data: companyAgent }, { data: membership }, { data: billing }] = await Promise.all([
    supabase
      .from("company_agents")
      .select(
        "id, name, status, widget_greeting, widget_launcher_type, widget_launcher_asset_url, widget_position, widget_offset_bottom, photo_type, photo_asset_url",
      )
      .eq("company_id", company.id)
      .eq("agent_id", agent.id)
      .maybeSingle(),
    supabase.from("company_users").select("role").eq("company_id", company.id).eq("user_id", user!.id).maybeSingle(),
    supabase.from("company_billing").select("plan_key, subscription_status").eq("company_id", company.id).maybeSingle(),
  ]);
  const whatsappEntitled = decideWhatsappPlanGate({
    subscription_status: billing?.subscription_status ?? null,
    whatsappIncluded: findPlan(billing?.plan_key)?.whatsappIncluded === true,
  }).allow;

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
  const photoSrc = resolveAgentPhoto(agentSlug, companyAgent.photo_type, companyAgent.photo_asset_url);

  const baseUrl = resolveCheckoutBaseUrl();
  const chatUrl = `${baseUrl}/talk/${company.slug}/${agentSlug}`;
  const embedSnippet = buildEmbedSnippet(baseUrl, company.slug, agentSlug, {
    greeting: companyAgent.widget_greeting,
    launcherType: companyAgent.widget_launcher_type,
    launcherAssetUrl: companyAgent.widget_launcher_asset_url,
    position: companyAgent.widget_position,
    offsetBottom: companyAgent.widget_offset_bottom,
  });
  const telegramLink = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME ?? ""}?start=${companyAgent.id}`;

  const [blurb, schedulingSetup] = await Promise.all([
    resolveAgentDescription(agentSlug, agent.description, name),
    agentSlug === "ana" ? loadSchedulingSetup(supabase, company.id) : Promise.resolve(null),
  ]);
  const photoType = (companyAgent.photo_type as "default_1" | "default_2" | "custom") ?? "default_1";

  return (
    <div className="flex max-w-5xl flex-col gap-10">
      <AgentConnectionsTour agentName={name} />
      <div className="flex flex-col gap-4">
        <BackLink href="/dashboard/my-agents">{t("backToMyAgents")}</BackLink>
        <AgentHero
          companyId={company.id}
          agentSlug={agentSlug}
          name={name}
          defaultName={fallbackName}
          role={agent.role}
          blurb={blurb}
          photoSrc={photoSrc}
          photoIsCustom={photoType === "custom"}
          active={companyAgent.status === "active"}
          canEdit={canEdit}
          defaultPhotos={agentDefaultPhotos(agentSlug)}
          initialPhoto={{ photoType, photoAssetUrl: companyAgent.photo_asset_url }}
        />
      </div>

      {agentSlug === "ana" ? <TutorialVideoCard agentName={name} /> : null}

      <Suspense fallback={null}>
        <ChannelHub
          companyId={company.id}
          agentSlug={agentSlug}
          agentName={name}
          agentPhotoSrc={photoSrc}
          canEdit={canEdit}
          whatsappEntitled={whatsappEntitled}
          metaAppId={process.env.META_APP_ID ?? ""}
          metaConfigId={process.env.META_WHATSAPP_CONFIG_ID ?? ""}
          chatUrl={chatUrl}
          embedSnippet={embedSnippet}
          telegramLink={telegramLink}
          widgetInitial={{
            greeting: companyAgent.widget_greeting,
            launcherType: companyAgent.widget_launcher_type,
            launcherAssetUrl: companyAgent.widget_launcher_asset_url,
            position: companyAgent.widget_position,
            offsetBottom: companyAgent.widget_offset_bottom,
          }}
          allowedEmbedDomains={company.allowed_embed_domains ?? []}
        />
      </Suspense>

      <section aria-labelledby="agent-behavior-title" className="flex flex-col gap-4">
        <div>
          <h2 id="agent-behavior-title" className="text-lg font-semibold tracking-tight text-on-surface">
            {t("behavior.title", { name })}
          </h2>
          {canEdit ? (
            <p className="mt-0.5 text-sm text-on-surface-variant">{t("behavior.description", { name })}</p>
          ) : null}
        </div>
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
      </section>

      {schedulingSetup ? <SchedulingSetupCard agentName={name} setup={schedulingSetup} /> : null}
    </div>
  );
}
