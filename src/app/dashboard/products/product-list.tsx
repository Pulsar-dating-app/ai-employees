"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { PackageIcon, XIcon } from "@/components/ui/icons";
import type { Product } from "./products-manager";

const LOW_STOCK = 3;

export function formatProductPrice(product: Product, locale: string): string | null {
  if (product.price == null) return null;
  const amount = Number(product.price);
  if (!product.currency) return new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(amount);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: product.currency }).format(amount);
  } catch {
    return `${product.currency} ${amount.toFixed(2)}`;
  }
}

function PencilIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function ProductThumb({ src, className }: { src: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={clsx(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container text-outline ring-1 ring-inset ring-outline-variant/40",
        className,
      )}
    >
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <PackageIcon className="h-5 w-5" />
      )}
    </span>
  );
}

function StockLabel({ stock }: { stock: number | null }) {
  const t = useTranslations("Products.catalog");
  if (stock == null) return <span className="text-[13px] text-outline">{t("stockUntracked")}</span>;
  const tone = stock <= 0 ? "out" : stock <= LOW_STOCK ? "low" : "in";
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-medium tabular-nums text-on-surface">
      <span
        aria-hidden="true"
        className={clsx(
          "h-2 w-2 shrink-0 rounded-full",
          tone === "out" ? "bg-error" : tone === "low" ? "bg-[#f0b429]" : "bg-success-500",
        )}
      />
      {tone === "out"
        ? t("stockOut")
        : tone === "low"
          ? t("stockLow", { count: stock })
          : t("stockIn", { count: stock })}
    </span>
  );
}

export function ProductRow({
  companyId,
  canEdit,
  product,
  index,
  onEdit,
  onPatched,
}: {
  companyId: string;
  canEdit: boolean;
  product: Product;
  index: number;
  onEdit: () => void;
  onPatched: (product: Product) => void;
}) {
  const t = useTranslations("Products.catalog");
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const price = formatProductPrice(product, locale);
  const meta = [product.sku, product.category].filter(Boolean).join(" · ");

  async function send(method: "DELETE" | "PATCH") {
    setIsWorking(true);
    const res = await fetch(`/api/companies/${companyId}/products/${product.id}`, {
      method,
      headers: method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
      body: method === "PATCH" ? JSON.stringify({ is_active: true }) : undefined,
    }).catch(() => null);
    setIsWorking(false);
    if (!res?.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setConfirming(false);
    const json = await res.json();
    onPatched(json.product);
  }

  return (
    <li
      className="billing-card-in rounded-2xl transition-colors duration-200 hover:bg-surface-container-low/70"
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
    >
      <div className="flex items-center gap-4 px-3 py-3 sm:px-4">
        <ProductThumb src={product.image_url} className={clsx("h-12 w-12", !product.is_active && "opacity-50")} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              {canEdit && product.is_active ? (
                <button
                  type="button"
                  onClick={onEdit}
                  className="truncate text-left text-[15px] font-semibold text-on-surface transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {product.name}
                </button>
              ) : (
                <span
                  className={clsx(
                    "truncate text-[15px] font-semibold",
                    product.is_active ? "text-on-surface" : "text-on-surface-variant",
                  )}
                >
                  {product.name}
                </span>
              )}
              {!product.is_active ? (
                <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 text-[12px] font-medium text-on-surface-variant">
                  {t("deactivatedBadge")}
                </span>
              ) : null}
            </p>
            {meta ? <p className="mt-0.5 truncate text-[13px] text-on-surface-variant">{meta}</p> : null}
          </div>
          <div className="flex items-center gap-4 sm:contents">
            <div className="sm:w-40">
              <StockLabel stock={product.stock} />
            </div>
            <p
              className={clsx(
                "ml-auto shrink-0 tabular-nums sm:ml-0 sm:w-28 sm:text-right",
                price ? "text-[15px] font-semibold text-on-surface" : "text-[13px] text-outline",
              )}
            >
              {price ?? t("noPrice")}
            </p>
          </div>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-1 sm:w-24 sm:justify-end">
            {product.is_active ? (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label={t("edit", { name: product.name })}
                  title={t("edit", { name: product.name })}
                  className="hidden h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-primary-fixed/60 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  aria-label={t("deactivate", { name: product.name })}
                  title={t("deactivate", { name: product.name })}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-outline transition-colors hover:bg-error-container/60 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isWorking}
                onClick={() => send("PATCH")}
                className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-label-sm font-semibold text-on-surface transition-[border-color,color] hover:border-primary/40 hover:text-primary disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {t("reactivate")}
              </button>
            )}
          </div>
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="mx-3 mb-2 text-sm text-error sm:mx-4">
          {t("actionError")}
        </p>
      ) : null}
      {confirming ? (
        <div className="inbox-pane-in mx-3 mb-3 flex flex-col gap-3 rounded-2xl bg-surface-container-low p-4 sm:mx-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-on-surface">{t("deactivatePrompt")}</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={isWorking}
              onClick={() => send("DELETE")}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-error px-4 text-label-sm font-semibold text-on-error transition-[filter] hover:brightness-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t("deactivateConfirm")}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setFailed(false);
              }}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-label-sm font-semibold text-on-surface transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
