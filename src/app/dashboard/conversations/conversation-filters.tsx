"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ConversationFiltersState } from "./conversations-manager";

const STATUS_OPTIONS = ["all", "paused", "active", "closed"] as const;

// Same "explicit Search button, local draft state" pattern as
// ProductFilters -- no debounce infra exists in this app.
export function ConversationFilters({
  filters,
  onChange,
}: {
  filters: ConversationFiltersState;
  onChange: (partial: Partial<Omit<ConversationFiltersState, "page">>) => void;
}) {
  const t = useTranslations("Conversations.filters");
  const [search, setSearch] = useState(filters.search);

  function applySearch() {
    onChange({ search });
  }

  return (
    <div className="mb-4 flex flex-col gap-4 border-b border-outline-variant pb-4">
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onChange({ status })}
            className={clsx(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              filters.status === status
                ? "bg-primary text-on-primary"
                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high",
            )}
          >
            {t(`status.${status}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <Input
          label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySearch()}
        />
        <Button type="button" variant="secondary" size="sm" onClick={applySearch}>
          {t("searchButton")}
        </Button>
      </div>
      <p className="text-xs text-on-surface-variant">{t("searchHint")}</p>
    </div>
  );
}
