"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ServiceFilters } from "./service-filters";
import { ServiceList } from "./service-list";
import { ServiceForm } from "./service-form";

export type Service = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price: string | number | null;
  currency: string | null;
  category: string | null;
  metadata: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceFiltersState = {
  category: string;
  search: string;
  includeInactive: boolean;
  page: number;
};

type ServicesManagerProps = {
  companyId: string;
  companyCurrency: string | null;
  canEdit: boolean;
  initialServices: Service[];
  initialTotal: number;
  pageSize: number;
};

const DEFAULT_FILTERS: ServiceFiltersState = {
  category: "",
  search: "",
  includeInactive: false,
  page: 1,
};

// Mirrors ProductsManager, minus the import panel — H1 has no CSV/XLSX
// import counterpart to B4, and services are typed in a handful at a time
// rather than synced from a store.
export function ServicesManager({
  companyId,
  companyCurrency,
  canEdit,
  initialServices,
  initialTotal,
  pageSize,
}: ServicesManagerProps) {
  const t = useTranslations("Services");

  const [services, setServices] = useState<Service[]>(initialServices);
  const [total, setTotal] = useState(initialTotal);
  const [filters, setFilters] = useState<ServiceFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function refetch(nextFilters: ServiceFiltersState) {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (nextFilters.category) params.set("category", nextFilters.category);
    if (nextFilters.search) params.set("search", nextFilters.search);
    if (nextFilters.includeInactive) params.set("includeInactive", "true");
    params.set("page", String(nextFilters.page));
    params.set("pageSize", String(pageSize));

    const res = await fetch(`/api/companies/${companyId}/services?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setServices(json.services ?? []);
      setTotal(json.total ?? 0);
    }
    setIsLoading(false);
  }

  function handleFilterChange(partial: Partial<Omit<ServiceFiltersState, "page">>) {
    const next = { ...filters, ...partial, page: 1 };
    setFilters(next);
    refetch(next);
  }

  function handlePageChange(page: number) {
    const next = { ...filters, page };
    setFilters(next);
    refetch(next);
  }

  function handleCreated() {
    setIsAddOpen(false);
    refetch(filters);
  }

  function handleUpdated() {
    setEditingId(null);
    refetch(filters);
  }

  function handleServicePatched(updated: Service) {
    setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  const editingService = services.find((s) => s.id === editingId) ?? null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      {canEdit ? (
        <Card>
          <CardHeader>
            <div className="flex flex-row items-center justify-between gap-3">
              <CardTitle>{t("form.addButton")}</CardTitle>
              <Button variant="secondary" size="sm" onClick={() => setIsAddOpen((v) => !v)}>
                {isAddOpen ? t("form.cancelButton") : t("form.addButton")}
              </Button>
            </div>
          </CardHeader>
          {isAddOpen ? (
            <CardContent>
              <ServiceForm
                companyId={companyId}
                mode="create"
                companyCurrency={companyCurrency}
                onSaved={handleCreated}
                onCancel={() => setIsAddOpen(false)}
              />
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("pageTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceFilters filters={filters} onChange={handleFilterChange} />

          <ServiceList
            companyId={companyId}
            canEdit={canEdit}
            services={services}
            isLoading={isLoading}
            onEdit={setEditingId}
            onPatched={handleServicePatched}
          />

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
              {t("filters.pageOf", { page: filters.page, totalPages })}
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

      <Dialog
        open={editingService !== null}
        onClose={() => setEditingId(null)}
        title={t("form.editDialogTitle")}
        closeLabel={t("closeDialogLabel")}
      >
        {editingService ? (
          <ServiceForm
            companyId={companyId}
            mode="edit"
            companyCurrency={companyCurrency}
            service={editingService}
            onSaved={handleUpdated}
            onCancel={() => setEditingId(null)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
