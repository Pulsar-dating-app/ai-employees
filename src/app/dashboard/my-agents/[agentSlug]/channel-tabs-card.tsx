"use client";

import { useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { WhatsAppIcon, InstagramIcon, CodeIcon, LinkIcon } from "@/components/ui/icons";
import { ChannelsSection } from "./channels-section";
import { InstagramConnectCard } from "./instagram-connect-card";
import { WidgetCustomizeCard } from "./widget-customize-card";
import { EmbedSnippetSection } from "./embed-snippet-section";
import { DirectLinkSection } from "./direct-link-section";

type TabKey = "whatsapp" | "instagram" | "embed" | "link";

// Trello D6 -- one card for every way a customer can reach a hired agent,
// replacing four separate full-width cards (WhatsApp, Instagram, widget
// customize, share/embed) with a single tabbed surface. All four panels
// stay mounted at all times (hidden via CSS, not conditional rendering):
// WidgetCustomizeCard and the embed snippet are coupled through a
// router.refresh() server round-trip, not props (see
// widget-customize-card.tsx's own comment), which has to keep working
// regardless of which tab happens to be active.
//
// Each panel used to render its own outer <Card> (visual boundary +
// padding); those were stripped to plain <div>s so this component's single
// <Card> is the only boundary now -- see the per-component diffs from
// 2026-09-04 for the mechanical edit.
export function ChannelTabsCard({
  companyId,
  agentSlug,
  agentName,
  canEdit,
  metaAppId,
  metaConfigId,
  chatUrl,
  embedSnippet,
  widgetInitial,
}: {
  companyId: string;
  agentSlug: string;
  agentName: string;
  canEdit: boolean;
  metaAppId: string;
  metaConfigId: string;
  chatUrl: string;
  embedSnippet: string;
  widgetInitial: {
    greeting: string | null;
    launcherType: "default" | "video" | "image";
    launcherAssetUrl: string | null;
  };
}) {
  const t = useTranslations("MyAgents.channelTabs");
  const [activeTab, setActiveTab] = useState<TabKey>("whatsapp");

  const tabs: { key: TabKey; label: string; icon: typeof WhatsAppIcon }[] = [
    { key: "whatsapp", label: t("whatsapp"), icon: WhatsAppIcon },
    { key: "instagram", label: t("instagram"), icon: InstagramIcon },
    { key: "embed", label: t("embed"), icon: CodeIcon },
    { key: "link", label: t("link"), icon: LinkIcon },
  ];

  return (
    <Card>
      <div role="tablist" aria-label={t("tablistLabel")} className="mb-6 flex gap-1 border-b border-outline-variant">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            id={`channel-tab-${key}`}
            aria-controls={`channel-tabpanel-${key}`}
            onClick={() => setActiveTab(key)}
            className={clsx(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="channel-tabpanel-whatsapp"
        aria-labelledby="channel-tab-whatsapp"
        hidden={activeTab !== "whatsapp"}
      >
        <ChannelsSection companyId={companyId} agentSlug={agentSlug} canEdit={canEdit} metaAppId={metaAppId} metaConfigId={metaConfigId} />
      </div>

      <div
        role="tabpanel"
        id="channel-tabpanel-instagram"
        aria-labelledby="channel-tab-instagram"
        hidden={activeTab !== "instagram"}
      >
        <InstagramConnectCard companyId={companyId} agentSlug={agentSlug} canEdit={canEdit} />
      </div>

      <div
        role="tabpanel"
        id="channel-tabpanel-embed"
        aria-labelledby="channel-tab-embed"
        hidden={activeTab !== "embed"}
        className="flex flex-col gap-8"
      >
        <WidgetCustomizeCard companyId={companyId} agentSlug={agentSlug} agentName={agentName} canEdit={canEdit} initial={widgetInitial} />
        <div className="h-px w-full bg-outline-variant/60" />
        <EmbedSnippetSection agentName={agentName} embedSnippet={embedSnippet} />
      </div>

      <div
        role="tabpanel"
        id="channel-tabpanel-link"
        aria-labelledby="channel-tab-link"
        hidden={activeTab !== "link"}
      >
        <DirectLinkSection agentName={agentName} chatUrl={chatUrl} />
      </div>
    </Card>
  );
}
