"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ProductFiltersState } from "./products-manager";

type ProductFiltersProps = {
  filters: ProductFiltersState;
  onChange: (partial: Partial<Omit<ProductFiltersState, "page">>) => void;
};

// Local draft state for search/category so typing doesn't refetch on every
// keystroke — no debounce infra exists in this app, so an explicit Search
// button (and onBlur/Enter for category) is the simplest correct fit.
export function ProductFilters({ filters, onChange }: ProductFiltersProps) {
  const t = useTranslations("Products.filters");
  const [search, setSearch] = useState(filters.search);
  const [category, setCategory] = useState(filters.category);

  function applySearch() {
    onChange({ search, category });
  }

  return (
    <div className="mb-4 flex flex-col gap-3 border-b border-neutral-200 pb-4 sm:flex-row sm:items-end sm:gap-4">
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
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={filters.includeInactive}
          onChange={(e) => onChange({ search, category, includeInactive: e.target.checked })}
          className="h-4 w-4 rounded border-neutral-300"
        />
        {t("includeInactiveLabel")}
      </label>
    </div>
  );
}
