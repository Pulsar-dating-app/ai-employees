"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { XIcon } from "@/components/ui/icons";

export function EmbedCloseButton({ className = "" }: { className?: string }) {
  const t = useTranslations("Chat");
  const isEmbedded = useSearchParams().get("embedded") === "1";
  if (!isEmbedded) return null;

  return (
    <button
      type="button"
      onClick={() => window.parent.postMessage({ type: "staffra-chat:close" }, "*")}
      aria-label={t("closeButton")}
      className={`shrink-0 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
    >
      <XIcon className="h-5 w-5" />
    </button>
  );
}
