"use client";

import { useTranslations } from "next-intl";
import { LinkIcon } from "@/components/ui/icons";
import { ChannelPanelHeader } from "./channel-panel-header";
import { ShareChatLink } from "@/components/channels/share-chat-link";
import { ChannelPreview } from "./channel-preview";

export function DirectLinkSection({
  agentSlug,
  agentName,
  agentPhotoSrc,
  accent,
  chatUrl,
  companyName,
}: {
  agentSlug: string;
  agentName: string;
  agentPhotoSrc: string | null;
  accent: string;
  chatUrl: string;
  companyName: string;
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
      <ShareChatLink chatUrl={chatUrl} companyName={companyName} scheduling={agentSlug === "ana"} surface="agent" />
      <ChannelPreview agentName={agentName} agentPhotoSrc={agentPhotoSrc} accent={accent} />
    </div>
  );
}
