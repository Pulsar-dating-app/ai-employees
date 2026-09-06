"use client";

import { useTranslations } from "next-intl";
import { TelegramIcon } from "@/components/ui/icons";
import { ChannelPanelHeader } from "./channel-panel-header";
import { CopyField } from "./copy-field";
import { ChannelPreview } from "./channel-preview";

// Trello O1 -- unlike WhatsApp/Instagram, there's no connect/disconnect
// state machine here: the deep link itself IS the connection (opening it
// sends /start <payload> to our webhook, which creates the customer on the
// spot). This tab is shaped like direct-link-section.tsx (the Link tab),
// not like channels-section.tsx/instagram-connect-card.tsx.
export function TelegramLinkSection({
  agentName,
  agentPhotoSrc,
  accent,
  telegramLink,
}: {
  agentName: string;
  agentPhotoSrc: string | null;
  accent: string;
  telegramLink: string;
}) {
  const t = useTranslations("MyAgents.telegram");

  return (
    <div className="flex flex-col gap-6">
      <ChannelPanelHeader
        icon={<TelegramIcon className="h-6 w-6" />}
        tileClassName="bg-[#229ED9] text-white"
        title={t("title")}
        description={t("description", { name: agentName })}
      />
      <CopyField value={telegramLink} label={t("title")} openHref={telegramLink} />
      <ChannelPreview agentName={agentName} agentPhotoSrc={agentPhotoSrc} accent={accent} />
    </div>
  );
}
