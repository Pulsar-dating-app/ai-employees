"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { BrandLogo } from "@/components/landing/brand-logos";
import { ProductForm } from "./product-form";
import { ImportPanel, type ImportJob } from "./import-panel";
import { ShopifyConnectCard } from "./shopify-connect-card";

export type AddMethod = "csv" | "shopify" | "manual";
export const ADD_METHODS: AddMethod[] = ["csv", "shopify", "manual"];

export function AddProductsPanel({
  companyId,
  companyCurrency,
  canManageConnection,
  categories,
  initialMethod,
  importJob,
  onImportStarted,
  onImportReset,
  onCatalogChanged,
  onCreated,
  onCancel,
}: {
  companyId: string;
  companyCurrency: string | null;
  canManageConnection: boolean;
  categories: string[];
  initialMethod: AddMethod;
  importJob: ImportJob | null;
  onImportStarted: (job: ImportJob) => void;
  onImportReset: () => void;
  onCatalogChanged: () => void;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Products");
  const [method, setMethod] = useState<AddMethod>(initialMethod);
  const tabRefs = useRef<Partial<Record<AddMethod, HTMLButtonElement | null>>>({});
  const { indicatorRef, register } = useSlidingIndicator<HTMLButtonElement>(method, null, "x");

  function focusMethod(next: AddMethod) {
    setMethod(next);
    tabRefs.current[next]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const i = ADD_METHODS.indexOf(method);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      focusMethod(ADD_METHODS[(i + dir + ADD_METHODS.length) % ADD_METHODS.length]);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label={t("catalog.methodsLabel")}
        onKeyDown={onKeyDown}
        className="relative grid grid-cols-3 gap-1 rounded-full bg-surface-container p-1"
      >
        <span
          ref={indicatorRef}
          aria-hidden="true"
          className="inbox-indicator absolute left-0 rounded-full bg-surface-container-lowest opacity-0 shadow-[0_1px_3px_rgba(25,28,29,0.14)]"
        />
        {ADD_METHODS.map((key) => {
          const selected = method === key;
          return (
            <button
              key={key}
              ref={(el) => {
                register(key)(el);
                tabRefs.current[key] = el;
              }}
              type="button"
              role="tab"
              id={`add-products-tab-${key}`}
              aria-selected={selected}
              aria-controls={`add-products-tabpanel-${key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setMethod(key)}
              className={clsx(
                "relative z-10 inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-label-md font-semibold transition-colors duration-200",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                selected ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {key === "shopify" ? <BrandLogo name="Shopify" className="h-4 w-4 shrink-0" /> : null}
              {t(`catalog.methods.${key}.title`)}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="add-products-tabpanel-csv"
        aria-labelledby="add-products-tab-csv"
        hidden={method !== "csv"}
      >
        <ImportPanel
          companyId={companyId}
          canEdit
          job={importJob}
          onJobStarted={onImportStarted}
          onReset={onImportReset}
        />
      </div>
      <div
        role="tabpanel"
        id="add-products-tabpanel-shopify"
        aria-labelledby="add-products-tab-shopify"
        hidden={method !== "shopify"}
      >
        <ShopifyConnectCard
          companyId={companyId}
          canManageConnection={canManageConnection}
          onSynced={onCatalogChanged}
        />
      </div>
      <div
        role="tabpanel"
        id="add-products-tabpanel-manual"
        aria-labelledby="add-products-tab-manual"
        hidden={method !== "manual"}
      >
        <ProductForm
          companyId={companyId}
          mode="create"
          companyCurrency={companyCurrency}
          categories={categories}
          onSaved={onCreated}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
