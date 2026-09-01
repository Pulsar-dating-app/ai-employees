"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LinkIcon, CodeIcon, InfoIcon, CopyIcon, CheckIcon } from "@/components/ui/icons";

// Trello M6 follow-up -- the old plain "Direct link" / "Embed code"
// CopyField rows replaced by this richer, sectioned layout (matching the
// Stitch "Share & Embed Dialog" reference for visual treatment). Briefly
// shipped behind a "Share & Embed" button opening this in a Dialog; the user
// preferred it inline on the page instead, so it's rendered directly inside
// WebChatChannelCard's CardContent -- no button, no modal, same two
// sections and styling either way.
function useCopyFeedback() {
  const [copied, setCopied] = useState(false);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser/OS (permissions,
      // insecure context) -- leave the button inert rather than crash; the
      // value is still fully visible/selectable in the field either way.
    }
  }

  return { copied, copy };
}

export function ShareEmbedSection({
  agentName,
  chatUrl,
  embedSnippet,
}: {
  agentName: string;
  chatUrl: string;
  embedSnippet: string;
}) {
  const t = useTranslations("MyAgents.shareEmbed");
  const link = useCopyFeedback();
  const script = useCopyFeedback();

  return (
    <div className="flex flex-col gap-6">
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

      <div className="h-px w-full bg-outline-variant/60" />

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
    </div>
  );
}
