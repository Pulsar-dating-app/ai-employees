"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConversationFilters } from "./conversation-filters";
import { ConversationList } from "./conversation-list";
import type { ConversationRow } from "@/lib/conversations/list";

export type ConversationFiltersState = {
  status: "all" | "paused" | "active" | "closed";
  search: string;
  page: number;
};

const DEFAULT_FILTERS: ConversationFiltersState = { status: "all", search: "", page: 1 };

export function ConversationsManager({
  companyId,
  initialConversations,
  initialTotal,
  pageSize,
}: {
  companyId: string;
  initialConversations: ConversationRow[];
  initialTotal: number;
  pageSize: number;
}) {
  const t = useTranslations("Conversations");

  const [conversations, setConversations] = useState<ConversationRow[]>(initialConversations);
  const [total, setTotal] = useState(initialTotal);
  const [filters, setFilters] = useState<ConversationFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(false);

  async function refetch(nextFilters: ConversationFiltersState) {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (nextFilters.status !== "all") params.set("status", nextFilters.status);
    if (nextFilters.search) params.set("search", nextFilters.search);
    params.set("page", String(nextFilters.page));
    params.set("pageSize", String(pageSize));

    const res = await fetch(`/api/companies/${companyId}/conversations?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setConversations(json.conversations ?? []);
      setTotal(json.total ?? 0);
    }
    setIsLoading(false);
  }

  function handleFilterChange(partial: Partial<Omit<ConversationFiltersState, "page">>) {
    const next = { ...filters, ...partial, page: 1 };
    setFilters(next);
    refetch(next);
  }

  function handlePageChange(page: number) {
    const next = { ...filters, page };
    setFilters(next);
    refetch(next);
  }

  return (
    <Card>
      <CardContent>
        <ConversationFilters filters={filters} onChange={handleFilterChange} />

        <ConversationList conversations={conversations} isLoading={isLoading} />

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={filters.page <= 1 || isLoading}
            onClick={() => handlePageChange(filters.page - 1)}
          >
            {t("filters.previousPage")}
          </Button>
          <span className="text-sm text-on-surface-variant">
            {t("filters.pageOf", { page: filters.page, totalPages: Math.max(1, Math.ceil(total / pageSize)) })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={filters.page * pageSize >= total || isLoading}
            onClick={() => handlePageChange(filters.page + 1)}
          >
            {t("filters.nextPage")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
