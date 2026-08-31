"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ServiceFiltersState } from "./services-manager";

type ServiceFiltersProps = {
  filters: ServiceFiltersState;
  onChange: (partial: Partial<Omit<ServiceFiltersState, "page">>) => void;
};

// Same shape as ProductFilters: local draft state so typing doesn't refetch
// on every keystroke, with an explicit Search button (and Enter) to apply —
// there's still no debounce infra in this app to lean on.
export function ServiceFilters({ filters, onChange }: ServiceFiltersProps) {
  const t = useTranslations("Services.filters");
  const [search, setSearch] = useState(filters.search);
  const [category, setCategory] = useState(filters.category);

  function applySearch() {
    onChange({ search, category });
  }

  return (
    <div className="mb-4 flex flex-col gap-3 border-b border-outline-variant pb-4 sm:flex-row sm:items-end sm:gap-4">
      <Input
        label={t("searchLabel")}
        placeholder={t("searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && applySearch()}
      />
      <Input
        label={t("categoryLabel")}
        placeholder={t("categoryPlaceholder")}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && applySearch()}
      />
      <Button type="button" variant="secondary" size="sm" onClick={applySearch}>
        {t("searchButton")}
      </Button>
      <label className="flex items-center gap-2 text-sm text-on-surface-variant">
        <input
          type="checkbox"
          checked={filters.includeInactive}
          onChange={(e) => onChange({ search, category, includeInactive: e.target.checked })}
          className="h-4 w-4 rounded border-outline-variant"
        />
        {t("includeInactiveLabel")}
      </label>
    </div>
  );
}
