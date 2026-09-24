"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
  XIcon,
} from "@/components/ui/icons";
import { SideDrawer } from "@/components/ui/side-drawer";
import { FilterChips } from "@/components/ui/filter-chips";
import { BrandLogo } from "@/components/landing/brand-logos";
import { ProductRow } from "./product-list";
import { ProductForm } from "./product-form";
import { AddProductsPanel, ADD_METHODS, type AddMethod } from "./add-products-panel";
import type { ImportJob } from "./import-panel";

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

type Filters = { search: string; category: string; includeInactive: boolean; page: number };
type DrawerState = { mode: "add"; method: AddMethod } | { mode: "edit"; id: string } | null;

const ALL = "__all__";
const SEARCH_DEBOUNCE_MS = 300;
const IMPORT_POLL_MS = 1200;

const PRIMARY_BUTTON =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-label-md font-semibold text-on-primary shadow-[0_8px_20px_-10px_rgba(53,37,205,0.7)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const METHOD_ICONS: Record<AddMethod, React.ReactNode> = {
  csv: <UploadIcon className="h-5 w-5" />,
  shopify: <BrandLogo name="Shopify" className="h-5 w-5" />,
  manual: <ListIcon className="h-5 w-5" />,
};

export function ProductsManager({
  companyId,
  companyCurrency,
  canEdit,
  canManageConnection,
  categories,
  activeCount,
  inactiveCount,
  initialProducts,
  initialTotal,
  pageSize,
}: {
  companyId: string;
  companyCurrency: string | null;
  canEdit: boolean;
  canManageConnection: boolean;
  categories: string[];
  activeCount: number;
  inactiveCount: number;
  initialProducts: Product[];
  initialTotal: number;
  pageSize: number;
}) {
  const t = useTranslations("Products");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [filters, setFilters] = useState<Filters>({ search: "", category: ALL, includeInactive: false, page: 1 });
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const requestId = useRef(0);
  const firstQuery = useRef(true);
  const filtersRef = useRef(filters);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const autoOpened = useRef(false);

  function commit(next: Filters) {
    filtersRef.current = next;
    setFilters(next);
  }

  const refetch = useCallback(
    async (next: Filters) => {
      const id = ++requestId.current;
      setIsLoading(true);
      const params = new URLSearchParams({ page: String(next.page), pageSize: String(pageSize) });
      if (next.category !== ALL) params.set("category", next.category);
      if (next.search) params.set("search", next.search);
      if (next.includeInactive) params.set("includeInactive", "true");
      const res = await fetch(`/api/companies/${companyId}/products?${params.toString()}`).catch(() => null);
      if (id !== requestId.current) return;
      setIsLoading(false);
      if (!res?.ok) {
        setLoadError(true);
        return;
      }
      const json = await res.json();
      setLoadError(false);
      setProducts(json.products ?? []);
      setTotal(json.total ?? 0);
    },
    [companyId, pageSize],
  );

  function apply(partial: Partial<Filters>) {
    const next = { ...filtersRef.current, page: 1, ...partial };
    commit(next);
    refetch(next);
  }

  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const next = { ...filtersRef.current, search: query.trim(), page: 1 };
      filtersRef.current = next;
      setFilters(next);
      refetch(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, refetch]);

  useEffect(() => {
    if (!canEdit || autoOpened.current) return;
    if (!searchParams.get("shopify") && !searchParams.get("shopify_error")) return;
    autoOpened.current = true;
    const frame = requestAnimationFrame(() => setDrawer((d) => d ?? { mode: "add", method: "shopify" }));
    return () => cancelAnimationFrame(frame);
  }, [canEdit, searchParams]);

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    fetch(`/api/companies/${companyId}/products/import/status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.job?.status === "processing") setImportJob(json.job);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canEdit, companyId]);

  const catalogChanged = useCallback(() => {
    refetch(filtersRef.current);
    router.refresh();
  }, [refetch, router]);

  const importProcessing = importJob?.status === "processing";
  const importPercent =
    importJob && importJob.totalRows > 0
      ? Math.round((Math.min(importJob.insertedCount, importJob.totalRows) / importJob.totalRows) * 100)
      : 0;

  useEffect(() => {
    if (!importProcessing) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/companies/${companyId}/products/import/status`).catch(() => null);
      if (!res?.ok) return;
      const json = await res.json();
      if (!json?.job) return;
      setImportJob(json.job);
      if (json.job.status !== "processing") catalogChanged();
    }, IMPORT_POLL_MS);
    return () => clearInterval(interval);
  }, [importProcessing, companyId, catalogChanged]);

  function clearFilters() {
    setQuery("");
    apply({ search: "", category: ALL });
  }

  function closeDrawer() {
    const wasAdding = drawer?.mode === "add";
    setDrawer(null);
    if (wasAdding) catalogChanged();
  }

  function handleSaved() {
    setDrawer(null);
    catalogChanged();
  }

  function handlePatched(updated: Product) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    router.refresh();
  }

  const editing = drawer?.mode === "edit" ? (products.find((p) => p.id === drawer.id) ?? null) : null;
  const isEmpty = activeCount === 0 && inactiveCount === 0;
  const from = total === 0 ? 0 : (filters.page - 1) * pageSize + 1;
  const to = Math.min(total, filters.page * pageSize);

  return (
    <div className="flex flex-col gap-6">
      {importJob && canEdit ? (
        <div
          className={clsx(
            "inbox-pane-in flex items-center gap-3 rounded-2xl px-4 py-3",
            importJob.status === "failed"
              ? "bg-error-container/60"
              : importJob.status === "succeeded"
                ? "bg-success-100"
                : "bg-primary-fixed/50",
          )}
        >
          <UploadIcon
            aria-hidden="true"
            className={clsx(
              "h-4 w-4 shrink-0",
              importJob.status === "failed"
                ? "text-error"
                : importJob.status === "succeeded"
                  ? "text-success-500"
                  : "text-primary",
            )}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
            <p
              role={importJob.status === "failed" ? "alert" : "status"}
              className={clsx(
                "text-sm font-semibold",
                importJob.status === "failed"
                  ? "text-error"
                  : importJob.status === "succeeded"
                    ? "text-success-500"
                    : "text-on-surface",
              )}
            >
              {importJob.status === "processing"
                ? t("import.progressLabel", { percent: importPercent })
                : importJob.status === "succeeded"
                  ? t("import.succeededSummary", { count: importJob.totalRows })
                  : t("import.failedSummary")}
            </p>
            {importJob.status === "processing" ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-lowest sm:max-w-56">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{ width: `${Math.max(2, importPercent)}%` }}
                />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setDrawer({ mode: "add", method: "csv" })}
            className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-primary transition-colors hover:bg-surface-container-lowest/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t("catalog.viewImport")}
          </button>
          {importJob.status !== "processing" ? (
            <button
              type="button"
              aria-label={t("catalog.dismiss")}
              onClick={() => setImportJob(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-lowest/60 hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <XIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
      {isEmpty ? (
        <section className="flex flex-col gap-6 pt-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-on-surface">{t("catalog.emptyTitle")}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{t("catalog.emptyBody")}</p>
          </div>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {ADD_METHODS.map((method, i) => (
              <li key={method} className="billing-card-in" style={{ "--i": i } as React.CSSProperties}>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setDrawer({ mode: "add", method })}
                  className="group flex h-full w-full flex-col items-start gap-4 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-5 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_16px_40px_-24px_rgba(53,37,205,0.45)] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-fixed text-primary">
                    {METHOD_ICONS[method]}
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold text-on-surface">
                      {t(`catalog.methods.${method}.title`)}
                    </span>
                    <span className="mt-1 block text-[13px] leading-5 text-on-surface-variant">
                      {t(`catalog.methods.${method}.body`)}
                    </span>
                  </span>
                  <ChevronRightIcon className="mt-auto h-4 w-4 text-outline transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="group relative sm:w-72 sm:shrink-0">
                <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-outline transition-colors group-focus-within:text-primary" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("catalog.search")}
                  aria-label={t("catalog.search")}
                  className="h-10 w-full rounded-full border border-transparent bg-surface-container pl-10 pr-9 text-sm text-on-surface outline-none transition-[background-color,border-color,box-shadow] placeholder:text-outline focus:border-primary/40 focus:bg-surface-container-lowest focus:shadow-[0_0_0_4px_rgba(53,37,205,0.08)] [&::-webkit-search-cancel-button]:hidden"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label={t("catalog.clearSearch")}
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-outline hover:bg-surface-container-high hover:text-on-surface"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              {categories.length > 1 ? (
                <FilterChips
                  keys={[ALL, ...categories]}
                  value={filters.category}
                  onChange={(category) => apply({ category })}
                  labelFor={(key) => (key === ALL ? t("catalog.all") : key)}
                  label={t("catalog.categoriesLabel")}
                />
              ) : null}
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setDrawer({ mode: "add", method: "csv" })}
                className={clsx(PRIMARY_BUTTON, "self-start lg:self-auto")}
              >
                <PlusIcon className="h-4 w-4" />
                {t("catalog.add")}
              </button>
            ) : null}
          </div>

          <section
            aria-label={t("catalog.label")}
            className="rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest p-2 shadow-[0_1px_2px_rgba(25,28,29,0.04)] sm:p-3"
          >
            <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-2 sm:px-4">
              <p className="text-[13px] font-medium text-on-surface-variant" role="status">
                {t("catalog.count", { count: total })}
              </p>
              {inactiveCount > 0 ? (
                <button
                  type="button"
                  aria-pressed={filters.includeInactive}
                  onClick={() => apply({ includeInactive: !filters.includeInactive })}
                  className={clsx(
                    "inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-semibold transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    filters.includeInactive
                      ? "bg-primary-fixed text-primary"
                      : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                      filters.includeInactive ? "border-primary bg-primary text-on-primary" : "border-outline",
                    )}
                  >
                    {filters.includeInactive ? (
                      <svg
                        viewBox="0 0 12 12"
                        className="h-2.5 w-2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="m2.5 6 2.5 2.5 4.5-5" />
                      </svg>
                    ) : null}
                  </span>
                  {t("catalog.showInactive")}
                </button>
              ) : null}
            </div>
            <div className="relative h-0.5 overflow-hidden rounded-full">
              {isLoading ? (
                <div className="animate-progress-sweep absolute inset-y-0 w-1/4 rounded-full bg-primary/60" />
              ) : null}
            </div>

            <div className={clsx("transition-opacity duration-200", isLoading && "opacity-60")}>
              {loadError ? (
                <p role="alert" className="px-4 py-10 text-center text-sm text-error">
                  {t("catalog.loadError")}
                </p>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                  <p className="text-sm text-on-surface-variant">
                    {filters.search && filters.category !== ALL
                      ? t("catalog.noMatchIn", { query: filters.search, category: filters.category })
                      : filters.search
                        ? t("catalog.noMatch", { query: filters.search })
                        : filters.category !== ALL
                          ? t("catalog.noMatchCategory", { category: filters.category })
                          : t("catalog.noMatchFilters")}
                  </p>
                  {filters.search || filters.category !== ALL ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-flex h-9 items-center rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-label-sm font-semibold text-on-surface transition-[border-color,color] hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {t("catalog.clearFilters")}
                    </button>
                  ) : null}
                </div>
              ) : (
                <ul
                  key={`${filters.page}-${filters.category}-${filters.search}-${filters.includeInactive}`}
                  className="flex flex-col"
                >
                  {products.map((product, i) => (
                    <ProductRow
                      key={product.id}
                      companyId={companyId}
                      canEdit={canEdit}
                      product={product}
                      index={i}
                      onEdit={() => setDrawer({ mode: "edit", id: product.id })}
                      onPatched={handlePatched}
                    />
                  ))}
                </ul>
              )}
            </div>

            {total > pageSize ? (
              <div className="mt-1 flex items-center justify-end gap-2 border-t border-outline-variant/40 px-3 pt-3 sm:px-4">
                <p className="mr-2 text-[13px] tabular-nums text-on-surface-variant">
                  {t("catalog.range", { from, to, total })}
                </p>
                <button
                  type="button"
                  aria-label={t("catalog.previousPage")}
                  disabled={filters.page <= 1 || isLoading}
                  onClick={() => apply({ page: filters.page - 1 })}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={t("catalog.nextPage")}
                  disabled={filters.page * pageSize >= total || isLoading}
                  onClick={() => apply({ page: filters.page + 1 })}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </section>
        </>
      )}

      <SideDrawer
        open={drawer !== null}
        title={editing ? t("catalog.editTitle", { name: editing.name }) : t("catalog.addTitle")}
        closeLabel={t("closeDialogLabel")}
        onClose={closeDrawer}
      >
        {drawer?.mode === "add" ? (
          <AddProductsPanel
            companyId={companyId}
            companyCurrency={companyCurrency}
            canManageConnection={canManageConnection}
            categories={categories}
            initialMethod={drawer.method}
            importJob={importJob}
            onImportStarted={setImportJob}
            onImportReset={() => setImportJob(null)}
            onCatalogChanged={catalogChanged}
            onCreated={handleSaved}
            onCancel={closeDrawer}
          />
        ) : editing ? (
          <ProductForm
            key={editing.id}
            companyId={companyId}
            mode="edit"
            companyCurrency={companyCurrency}
            categories={categories}
            product={editing}
            onSaved={handleSaved}
            onCancel={closeDrawer}
          />
        ) : null}
      </SideDrawer>
    </div>
  );
}
