"use client";

import { useTranslations } from "next-intl";
import { CodeIcon, InfoIcon, CopyIcon, CheckIcon } from "@/components/ui/icons";
import { useCopyFeedback } from "./use-copy-feedback";

// Trello D6 -- the copyable-snippet half of the "Embed" tab of
// ChannelTabsCard, next to WidgetCustomizeCard's editor. The embed half of
// the old share-embed-section.tsx (now split one section per tab).
export function EmbedSnippetSection({ agentName, embedSnippet }: { agentName: string; embedSnippet: string }) {
  const t = useTranslations("MyAgents.shareEmbed");
  const script = useCopyFeedback();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <CodeIcon className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-semibold text-on-surface">{t("embedSectionLabel")}</h3>
      </div>

      <div className="mt-1 rounded-lg border border-outline-variant bg-surface-container-low p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            {t("htmlSnippetLabel")}
          </span>
          <button
            type="button"
            onClick={() => script.copy(embedSnippet)}
            className="flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary-container"
          >
            {script.copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
            {script.copied ? t("copiedButton") : t("copyScriptButton")}
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg bg-inverse-surface p-4">
          <code className="whitespace-nowrap font-mono text-sm text-inverse-on-surface">{embedSnippet}</code>
        </div>
      </div>

      <div className="mt-2 flex items-start gap-3 rounded-lg bg-tertiary-container/10 p-4">
        <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-tertiary-container" />
        <p className="text-sm leading-relaxed text-on-surface-variant">{t("embedInfoText", { name: agentName })}</p>
      </div>
    </div>
  );
}
