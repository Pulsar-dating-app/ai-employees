"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ClockIcon } from "@/components/ui/icons";

export function PendingConfirmationBanner({
  count,
  isFiltered,
  isLoading,
  onToggle,
}: {
  count: number;
  isFiltered: boolean;
  isLoading: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("Conversations.pending");

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary-container/40 bg-primary-fixed p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container-lowest text-primary">
          <ClockIcon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-on-surface">{t("bannerTitle", { count })}</p>
          <p className="mt-0.5 text-sm text-on-surface-variant">{t("bannerBody")}</p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant={isFiltered ? "secondary" : "primary"}
        disabled={isLoading}
        onClick={onToggle}
        className="shrink-0"
      >
        {isFiltered ? t("showAll") : t("showPending")}
      </Button>
    </div>
  );
}
