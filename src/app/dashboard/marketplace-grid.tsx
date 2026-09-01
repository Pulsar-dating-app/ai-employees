"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "@/components/ui/icons";
import { HireableAgentCard, type MarketplaceAgent } from "./agent-card";

// Client-side filter over the (small) live agent roster — there's no agent
// search endpoint and the list is a handful of rows, so this stays in the
// browser. Stitch's "All Departments" select is dropped (no such data).
export function MarketplaceGrid({ agents }: { agents: MarketplaceAgent[] }) {
  const t = useTranslations("Marketplace");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => `${a.name} ${a.role}`.toLowerCase().includes(q));
  }, [agents, query]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="relative w-full sm:max-w-xs sm:self-end">
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

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant px-6 py-10 text-center text-sm text-on-surface-variant">
          {t("noResults", { query })}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {filtered.map((agent, index) => (
            <HireableAgentCard
              key={agent.slug}
              agent={agent}
              style={{ animationDelay: `${index * 80}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
