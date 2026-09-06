"use client";

import { useTranslations } from "next-intl";
import { CopyIcon, CheckIcon, ExternalLinkIcon } from "@/components/ui/icons";
import { useCopyFeedback } from "./use-copy-feedback";

// A read-only value with trailing copy (and optional open) affordances in
// one bordered field — replaces the old "input wrapper + a separate h-12
// primary button stacked on mobile" rows, which never lined up in height
// and re-implemented the primary button by hand.
export function CopyField({
  value,
  label,
  openHref,
}: {
  value: string;
  label?: string;
  openHref?: string;
}) {
  const t = useTranslations("MyAgents.shareEmbed");
  const { copied, copy } = useCopyFeedback();

  return (
    <div className="flex h-11 items-stretch overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <input
        readOnly
        type="text"
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 truncate bg-transparent px-4 font-mono text-[13px] text-on-surface outline-none"
      />
      {openHref ? (
        <a
          href={openHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("openLink")}
          className="flex shrink-0 items-center border-l border-outline-variant px-3 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <ExternalLinkIcon className="h-4 w-4" />
        </a>
      ) : null}
      <button
        type="button"
        onClick={() => copy(value)}
        aria-label={copied ? t("copiedButton") : t("copyLinkButton")}
        className="flex shrink-0 items-center gap-1.5 border-l border-outline-variant px-3.5 text-sm font-medium text-primary transition-colors hover:bg-surface-container sm:px-4"
      >
        {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
        <span className="hidden sm:inline">{copied ? t("copiedButton") : t("copyLinkButton")}</span>
      </button>
    </div>
  );
}
