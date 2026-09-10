"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "@/components/ui/icons";
import { TeamAgentCard, type TeamAgent, type TeamAgentStatus } from "./agent-card";

type FilterValue = "all" | TeamAgentStatus;

// Client-side filter+search over the (small) live agent roster — there's no
// agent search endpoint and the list is a handful of rows, so both stay in
// the browser, same reasoning the old marketplace-grid.tsx (this file's
// predecessor) already established for search alone.
//
// The status filter is the direct answer to "keep only the active/inactive
// status" -- All/Active/Paused/Available, reusing the underline tab-strip
// visual language already established by scheduling-tabs.tsx and
// channel-tabs-card.tsx rather than inventing a new segmented-control look.
// It's a plain filter over an in-place list, not a real ARIA tablist
// switching panels, so no roving-tabindex/role="tab" machinery here.
export function TeamGrid({ agents, billingActive }: { agents: TeamAgent[]; billingActive: boolean }) {
  const t = useTranslations("MyAgents");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (filter !== "all" && a.status !== filter) return false;
      if (!q) return true;
      return `${a.name} ${a.role}`.toLowerCase().includes(q);
    });
  }, [agents, query, filter]);

  const filters: { value: FilterValue; label: string }[] = [
    { value: "all", label: t("filterAll") },
    { value: "active", label: t("filterActive") },
    { value: "paused", label: t("filterPaused") },
    { value: "available", label: t("filterAvailable") },
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex gap-4 overflow-x-auto border-b border-outline-variant [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={clsx(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2 text-sm transition-colors duration-150",
                filter === f.value
                  ? "border-primary font-semibold text-primary"
                  : "border-transparent font-medium text-on-surface-variant hover:border-outline-variant hover:text-on-surface",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
            aria-label={t("searchPlaceholder")}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant px-6 py-10 text-center text-sm text-on-surface-variant">
          {query.trim() ? t("noResults", { query }) : t("noFilterResults")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {filtered.map((agent, index) => (
            <TeamAgentCard
              key={agent.slug}
              agent={agent}
              billingActive={billingActive}
              style={{ animationDelay: `${index * 80}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
