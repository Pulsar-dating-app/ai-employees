"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { ChannelsSection } from "./channels-section";
import { InstagramConnectCard } from "./instagram-connect-card";
import { WidgetCustomizeCard } from "./widget-customize-card";
import { EmbedSnippetSection } from "./embed-snippet-section";
import { DirectLinkSection } from "./direct-link-section";
import { TelegramLinkSection } from "./telegram-link-section";

type TabKey = "whatsapp" | "instagram" | "telegram" | "embed" | "link";

const TAB_KEYS: TabKey[] = ["whatsapp", "instagram", "telegram", "embed", "link"];

// Per-channel accent — colours the active tab and a faint wash at the top of
// the card, and is handed to each panel for its preview tint.
const CHANNEL_ACCENT: Record<TabKey, string> = {
  whatsapp: "#1FA855",
  instagram: "#C13584",
  telegram: "#1D8FC7",
  embed: "#3525cd",
  link: "#3525cd",
};

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
//
// Tab strip: text-only, matching the Scheduling sub-tabs pattern
// (scheduling-tabs.tsx) -- the panel headers already carry the branded
// channel marks, so a second row of mixed-weight brand glyphs here was just
// noise. Full-bleed and horizontally scrollable so five labels never wrap
// or clip in the narrow config column; roving tabindex + arrow keys follow
// the WAI-ARIA tabs pattern.
export function ChannelTabsCard({
  companyId,
  agentSlug,
  agentName,
  agentPhotoSrc,
  canEdit,
  metaAppId,
  metaConfigId,
  chatUrl,
  embedSnippet,
  telegramLink,
  widgetInitial,
}: {
  companyId: string;
  agentSlug: string;
  agentName: string;
  agentPhotoSrc: string | null;
  canEdit: boolean;
  metaAppId: string;
  metaConfigId: string;
  chatUrl: string;
  embedSnippet: string;
  telegramLink: string;
  widgetInitial: {
    greeting: string | null;
    launcherType: "default" | "video" | "image";
    launcherAssetUrl: string | null;
  };
}) {
  const t = useTranslations("MyAgents.channelTabs");
  const [activeTab, setActiveTab] = useState<TabKey>("whatsapp");
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});

  const focusTab = useCallback((key: TabKey) => {
    setActiveTab(key);
    tabRefs.current[key]?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const i = TAB_KEYS.indexOf(activeTab);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        focusTab(TAB_KEYS[(i + dir + TAB_KEYS.length) % TAB_KEYS.length]);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusTab(TAB_KEYS[0]);
      } else if (e.key === "End") {
        e.preventDefault();
        focusTab(TAB_KEYS[TAB_KEYS.length - 1]);
      }
    },
    [activeTab, focusTab],
  );

  const accent = CHANNEL_ACCENT[activeTab];

  return (
    <Card
      className="relative isolate overflow-hidden"
      style={{ backgroundImage: `linear-gradient(180deg, ${accent}0f, transparent 200px)` }}
    >
      <div
        role="tablist"
        aria-label={t("tablistLabel")}
        onKeyDown={onKeyDown}
        className="-mx-6 mb-6 flex gap-1 overflow-x-auto border-b border-outline-variant px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TAB_KEYS.map((key) => {
          const selected = activeTab === key;
          return (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[key] = el;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              id={`channel-tab-${key}`}
              aria-controls={`channel-tabpanel-${key}`}
              onClick={() => setActiveTab(key)}
              style={selected ? { borderColor: accent, color: accent } : undefined}
              className={clsx(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                selected
                  ? "font-semibold"
                  : "border-transparent font-medium text-on-surface-variant hover:border-outline-variant hover:text-on-surface",
              )}
            >
              {t(key)}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="channel-tabpanel-whatsapp"
        aria-labelledby="channel-tab-whatsapp"
        hidden={activeTab !== "whatsapp"}
      >
        <ChannelsSection companyId={companyId} agentSlug={agentSlug} agentName={agentName} agentPhotoSrc={agentPhotoSrc} accent={CHANNEL_ACCENT.whatsapp} canEdit={canEdit} metaAppId={metaAppId} metaConfigId={metaConfigId} />
      </div>

      <div
        role="tabpanel"
        id="channel-tabpanel-instagram"
        aria-labelledby="channel-tab-instagram"
        hidden={activeTab !== "instagram"}
      >
        <InstagramConnectCard companyId={companyId} agentSlug={agentSlug} agentName={agentName} agentPhotoSrc={agentPhotoSrc} accent={CHANNEL_ACCENT.instagram} canEdit={canEdit} />
      </div>

      <div
        role="tabpanel"
        id="channel-tabpanel-telegram"
        aria-labelledby="channel-tab-telegram"
        hidden={activeTab !== "telegram"}
      >
        <TelegramLinkSection agentName={agentName} agentPhotoSrc={agentPhotoSrc} accent={CHANNEL_ACCENT.telegram} telegramLink={telegramLink} />
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
        <DirectLinkSection agentName={agentName} agentPhotoSrc={agentPhotoSrc} accent={CHANNEL_ACCENT.link} chatUrl={chatUrl} />
      </div>
    </Card>
  );
}
