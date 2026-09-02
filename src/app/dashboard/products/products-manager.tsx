"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ProductFilters } from "./product-filters";
import { ProductList } from "./product-list";
import { ProductForm } from "./product-form";
import { ImportPanel } from "./import-panel";

export type Product = {
  id: string;
  company_id: string;
  external_id: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  price: string | number | null;
  currency: string | null;
  stock: number | null;
  image_url: string | null;
  product_url: string | null;
  category: string | null;
  metadata: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductFiltersState = {
  category: string;
  search: string;
  includeInactive: boolean;
  page: number;
};

type ProductsManagerProps = {
  companyId: string;
  companyCurrency: string | null;
  canEdit: boolean;
  initialProducts: Product[];
  initialTotal: number;
  pageSize: number;
};

const DEFAULT_FILTERS: ProductFiltersState = {
  category: "",
  search: "",
  includeInactive: false,
  page: 1,
};

export function ProductsManager({
  companyId,
  companyCurrency,
  canEdit,
  initialProducts,
  initialTotal,
  pageSize,
}: ProductsManagerProps) {
  const t = useTranslations("Products");

  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [filters, setFilters] = useState<ProductFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function refetch(nextFilters: ProductFiltersState) {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (nextFilters.category) params.set("category", nextFilters.category);
    if (nextFilters.search) params.set("search", nextFilters.search);
    if (nextFilters.includeInactive) params.set("includeInactive", "true");
    params.set("page", String(nextFilters.page));
    params.set("pageSize", String(pageSize));

    const res = await fetch(`/api/companies/${companyId}/products?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setProducts(json.products ?? []);
      setTotal(json.total ?? 0);
    }
    setIsLoading(false);
  }

  function handleFilterChange(partial: Partial<Omit<ProductFiltersState, "page">>) {
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

  function handleProductPatched(updated: Product) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  const editingProduct = products.find((p) => p.id === editingId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("import.title")}</CardTitle>
          <CardDescription>{t("import.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ImportPanel companyId={companyId} canEdit={canEdit} onImported={() => refetch(filters)} />
        </CardContent>
      </Card>

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
              <ProductForm
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
          <ProductFilters filters={filters} onChange={handleFilterChange} />

          <ProductList
            companyId={companyId}
            canEdit={canEdit}
            products={products}
            isLoading={isLoading}
            onEdit={setEditingId}
            onPatched={handleProductPatched}
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
            <span className="text-sm text-neutral-500">
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

      <Dialog
        open={editingProduct !== null}
        onClose={() => setEditingId(null)}
        title={t("form.editDialogTitle")}
        closeLabel={t("closeDialogLabel")}
      >
        {editingProduct ? (
          <ProductForm
            companyId={companyId}
            mode="edit"
            companyCurrency={companyCurrency}
            product={editingProduct}
            onSaved={handleUpdated}
            onCancel={() => setEditingId(null)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
