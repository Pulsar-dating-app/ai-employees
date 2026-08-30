"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { CopyIcon, CheckIcon } from "@/components/ui/icons";

// Trello M6 -- alongside (not replacing) the WhatsApp channels card. Two
// copyable values: the standalone chat link (M4) and the embed snippet
// (M5's public/widget.js), both built from the same base URL and slugs the
// server component already resolved -- this component just displays them.
function CopyField({ label, value }: { label: string; value: string }) {
  const t = useTranslations("MyAgents.webChat");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser/OS (permissions,
      // insecure context) -- leave the button inert rather than crash;
      // the value is still fully visible and selectable in the field.
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
      <div className="flex items-start gap-2 rounded-md border border-outline-variant bg-surface-container-low p-3">
        <code className="flex-1 overflow-x-auto break-all font-mono text-sm text-on-surface">{value}</code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={t("copyButton")}
          className="shrink-0 rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          {copied ? (
            <CheckIcon className="h-4 w-4 text-tertiary-container" />
          ) : (
            <CopyIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

export function WebChatChannelCard({ chatUrl, embedSnippet }: { chatUrl: string; embedSnippet: string }) {
  const t = useTranslations("MyAgents.webChat");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <CopyField label={t("linkLabel")} value={chatUrl} />
        <CopyField label={t("embedLabel")} value={embedSnippet} />
        <p className="text-xs text-on-surface-variant">{t("embedHint")}</p>
      </CardContent>
    </Card>
  );
}
