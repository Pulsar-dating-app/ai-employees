"use client";

import { useTranslations } from "next-intl";
import { LinkIcon } from "@/components/ui/icons";
import { ChannelPanelHeader } from "./channel-panel-header";
import { CopyField } from "./copy-field";
import { ChannelPreview } from "./channel-preview";

// Trello D6 -- the "Link" tab of ChannelTabsCard. The direct-link half of
// the old share-embed-section.tsx (now split one section per tab, since
// M6/M4 never needed a shared file with the embed snippet beyond living on
// the same page).
export function DirectLinkSection({
  agentName,
  agentPhotoSrc,
  accent,
  chatUrl,
}: {
  agentName: string;
  agentPhotoSrc: string | null;
  accent: string;
  chatUrl: string;
}) {
  const t = useTranslations("MyAgents.shareEmbed");

  return (
    <div className="flex flex-col gap-6">
      <ChannelPanelHeader
        icon={<LinkIcon className="h-5 w-5" />}
        tileClassName="bg-primary-fixed text-primary"
        title={t("directLinkLabel")}
        description={t("directLinkDescription", { name: agentName })}
      />
      <CopyField value={chatUrl} label={t("directLinkLabel")} openHref={chatUrl} />
      <ChannelPreview agentName={agentName} agentPhotoSrc={agentPhotoSrc} accent={accent} />
    </div>
  );
}
