"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import type { Product } from "./products-manager";

type ProductListProps = {
  companyId: string;
  canEdit: boolean;
  products: Product[];
  isLoading: boolean;
  onEdit: (id: string) => void;
  onPatched: (product: Product) => void;
};

function formatPrice(product: Product): string {
  if (product.price == null) return "—";
  const amount = Number(product.price).toFixed(2);
  return product.currency ? `${product.currency} ${amount}` : amount;
}

export function ProductList({ companyId, canEdit, products, isLoading, onEdit, onPatched }: ProductListProps) {
  const t = useTranslations("Products");

  if (products.length === 0 && !isLoading) {
    return <p className="py-6 text-sm text-neutral-500">{t("filters.emptyState")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-500">
            <th className="py-2 pr-3 font-medium">{t("list.nameColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.priceColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.stockColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.categoryColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.statusColumn")}</th>
            {canEdit ? <th className="py-2 pr-3 font-medium">{t("list.actionsColumn")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <ProductRow
              key={product.id}
              companyId={companyId}
              canEdit={canEdit}
              product={product}
              onEdit={() => onEdit(product.id)}
              onPatched={onPatched}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductRow({
  companyId,
  canEdit,
  product,
  onEdit,
  onPatched,
}: {
  companyId: string;
  canEdit: boolean;
  product: Product;
  onEdit: () => void;
  onPatched: (product: Product) => void;
}) {
  const t = useTranslations("Products");
  const [confirming, setConfirming] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  async function handleDeactivate() {
    setIsWorking(true);
    const res = await fetch(`/api/companies/${companyId}/products/${product.id}`, { method: "DELETE" });
    setIsWorking(false);
    setConfirming(false);
    if (res.ok) {
      const json = await res.json();
      onPatched(json.product);
    }
  }

  async function handleReactivate() {
    setIsWorking(true);
    const res = await fetch(`/api/companies/${companyId}/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    setIsWorking(false);
    if (res.ok) {
      const json = await res.json();
      onPatched(json.product);
    }
  }

  return (
    <tr className={clsx("border-b border-neutral-100", !product.is_active && "opacity-50")}>
      <td className="py-2 pr-3">{product.name}</td>
      <td className="py-2 pr-3">{formatPrice(product)}</td>
      <td className="py-2 pr-3">{product.stock ?? t("list.noStock")}</td>
      <td className="py-2 pr-3">{product.category ?? t("list.noStock")}</td>
      <td className="py-2 pr-3">{product.is_active ? t("list.activeLabel") : t("list.inactiveLabel")}</td>
      {canEdit ? (
        <td className="py-2 pr-3">
          <div className="flex items-center gap-2">
            {product.is_active ? (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
                  {t("form.editButton")}
                </Button>
                {confirming ? (
                  <>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      isLoading={isWorking}
                      onClick={handleDeactivate}
                    >
                      {t("delete.confirmButton")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                      {t("delete.cancelButton")}
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
                    {t("delete.deactivateButton")}
                  </Button>
                )}
              </>
            ) : (
              <Button type="button" variant="secondary" size="sm" isLoading={isWorking} onClick={handleReactivate}>
                {t("delete.reactivateButton")}
              </Button>
            )}
          </div>
        </td>
      ) : null}
    </tr>
  );
}
