"use client";

import { useTranslations } from "next-intl";
import { CodeIcon, InfoIcon, CopyIcon, CheckIcon } from "@/components/ui/icons";
import { ChannelPanelHeader } from "./channel-panel-header";
import { useCopyFeedback } from "./use-copy-feedback";

// Trello D6 -- the copyable-snippet half of the "Embed" tab of
// ChannelTabsCard, next to WidgetCustomizeCard's editor. The embed half of
// the old share-embed-section.tsx (now split one section per tab).
export function EmbedSnippetSection({ agentName, embedSnippet }: { agentName: string; embedSnippet: string }) {
  const t = useTranslations("MyAgents.shareEmbed");
  const script = useCopyFeedback();

  return (
    <div className="flex flex-col gap-6">
      <ChannelPanelHeader
        icon={<CodeIcon className="h-5 w-5" />}
        tileClassName="bg-primary-fixed text-primary"
        title={t("embedSectionLabel")}
      />

      <div className="overflow-hidden rounded-lg border border-outline-variant">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            {t("htmlSnippetLabel")}
          </span>
          <button
            type="button"
            onClick={() => script.copy(embedSnippet)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary-container"
          >
            {script.copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
            {script.copied ? t("copiedButton") : t("copyScriptButton")}
          </button>
        </div>
        <div className="overflow-x-auto bg-inverse-surface p-4">
          <code className="whitespace-nowrap font-mono text-sm text-inverse-on-surface">{embedSnippet}</code>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg bg-tertiary-container/10 p-4">
        <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-tertiary-container" />
        <p className="text-sm leading-relaxed text-on-surface-variant">{t("embedInfoText", { name: agentName })}</p>
      </div>
    </div>
  );
}
