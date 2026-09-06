"use client";

import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/agents/agent-avatar";

// Shows the merchant what a customer will see once this channel is live: the
// agent's own portrait in a sample chat bubble. Sits in the not-connected /
// pre-share state of each channel panel so the empty state carries the
// payoff instead of only prerequisites.
export function ChannelPreview({
  agentName,
  agentPhotoSrc,
  accent,
}: {
  agentName: string;
  agentPhotoSrc: string | null;
  accent: string;
}) {
  const t = useTranslations("MyAgents.channelTabs");

  return (
    <div
      className="rounded-lg border border-outline-variant p-4"
      style={{ backgroundColor: `${accent}0a` }}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        {t("previewLabel")}
      </p>
      <div className="flex items-start gap-2.5">
        <AgentAvatar
          role="intent"
          size="md"
          shape="circle"
          photoSrc={agentPhotoSrc}
          alt={agentName}
        />
        <div className="relative max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-container-lowest px-3.5 py-2 shadow-level1">
          <span className="absolute -left-1 top-3 h-2 w-2 rotate-45 bg-surface-container-lowest" />
          <p className="text-[13px] font-semibold text-on-surface">{agentName}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-on-surface-variant">
            {t("previewMessage", { name: agentName })}
          </p>
        </div>
      </div>
    </div>
  );
}
