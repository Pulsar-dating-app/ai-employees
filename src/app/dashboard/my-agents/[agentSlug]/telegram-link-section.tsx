"use client";

import { useTranslations } from "next-intl";
import { TelegramIcon, CopyIcon, CheckIcon } from "@/components/ui/icons";
import { useCopyFeedback } from "./use-copy-feedback";

// Trello O1 -- unlike WhatsApp/Instagram, there's no connect/disconnect
// state machine here: the deep link itself IS the connection (opening it
// sends /start <payload> to our webhook, which creates the customer on the
// spot). This tab is shaped like direct-link-section.tsx (the Link tab),
// not like channels-section.tsx/instagram-connect-card.tsx.
export function TelegramLinkSection({ agentName, telegramLink }: { agentName: string; telegramLink: string }) {
  const t = useTranslations("MyAgents.telegram");
  const link = useCopyFeedback();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#229ED9] text-white shadow-sm">
          <TelegramIcon className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-on-surface">{t("title")}</h2>
          <p className="text-sm text-on-surface-variant">{t("description", { name: agentName })}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center rounded-lg border border-transparent bg-surface-container-low px-4 py-3 transition-colors focus-within:border-primary focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary/20">
          <input
            readOnly
            type="text"
            value={telegramLink}
            className="w-full truncate border-none bg-transparent p-0 text-sm text-on-surface outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
        <button
          type="button"
          onClick={() => link.copy(telegramLink)}
          className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-on-primary shadow-sm transition-colors hover:brightness-90"
        >
          {link.copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          {link.copied ? t("copiedButton") : t("copyLinkButton")}
        </button>
      </div>
    </div>
  );
}
