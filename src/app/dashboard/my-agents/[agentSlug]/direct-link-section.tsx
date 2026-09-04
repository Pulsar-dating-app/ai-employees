"use client";

import { useTranslations } from "next-intl";
import { LinkIcon, CopyIcon, CheckIcon } from "@/components/ui/icons";
import { useCopyFeedback } from "./use-copy-feedback";

// Trello D6 -- the "Link" tab of ChannelTabsCard. The direct-link half of
// the old share-embed-section.tsx (now split one section per tab, since
// M6/M4 never needed a shared file with the embed snippet beyond living on
// the same page).
export function DirectLinkSection({ agentName, chatUrl }: { agentName: string; chatUrl: string }) {
  const t = useTranslations("MyAgents.shareEmbed");
  const link = useCopyFeedback();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <LinkIcon className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-semibold text-on-surface">{t("directLinkLabel")}</h3>
      </div>
      <p className="text-sm text-on-surface-variant">{t("directLinkDescription", { name: agentName })}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center rounded-lg border border-transparent bg-surface-container-low px-4 py-3 transition-colors focus-within:border-primary focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary/20">
          <input
            readOnly
            type="text"
            value={chatUrl}
            className="w-full truncate border-none bg-transparent p-0 text-sm text-on-surface outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
        <button
          type="button"
          onClick={() => link.copy(chatUrl)}
          className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-on-primary shadow-sm transition-colors hover:brightness-90"
        >
          {link.copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          {link.copied ? t("copiedButton") : t("copyLinkButton")}
        </button>
      </div>
    </div>
  );
}
