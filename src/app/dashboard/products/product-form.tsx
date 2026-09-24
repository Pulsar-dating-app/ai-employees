"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "./product-list";
import type { Product } from "./products-manager";

const CURRENCY_CODES = ["USD", "BRL", "EUR"] as const;

type FormValues = {
  name: string;
  description: string;
  price: string;
  currency: string;
  stock: string;
  image_url: string;
  product_url: string;
  category: string;
  sku: string;
};

function toFormValues(product: Product | undefined, companyCurrency: string | null): FormValues {
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product?.price != null ? String(product.price) : "",
    currency: product?.currency ?? companyCurrency ?? "",
    stock: product?.stock != null ? String(product.stock) : "",
    image_url: product?.image_url ?? "",
    product_url: product?.product_url ?? "",
    category: product?.category ?? "",
    sku: product?.sku ?? "",
  };
}

type ProductFormProps = {
  companyId: string;
  mode: "create" | "edit";
  companyCurrency: string | null;
  product?: Product;
  categories: string[];
  onSaved: (product: Product) => void;
  onCancel: () => void;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-[13px] font-semibold text-on-surface-variant">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ProductForm({
  companyId,
  mode,
  companyCurrency,
  product,
  categories,
  onSaved,
  onCancel,
}: ProductFormProps) {
  const t = useTranslations("Products.form");
  const tCommon = useTranslations("Products");
  const [values, setValues] = useState<FormValues>(toFormValues(product, companyCurrency));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setError(null);
    const name = values.name.trim();
    if (!name) {
      setError(t("nameRequired"));
      return;
    }
    const hasPrice = values.price.trim() !== "";
    const price = hasPrice ? Number(values.price) : null;
    if (hasPrice && (Number.isNaN(price!) || price! < 0)) {
      setError(t("priceInvalid"));
      return;
    }
    const currency = values.currency.trim() || null;
    if (hasPrice && !currency) {
      setError(t("currencyRequiredWithPrice"));
      return;
    }
    const hasStock = values.stock.trim() !== "";
    const stock = hasStock ? Number(values.stock) : null;
    if (hasStock && (!Number.isInteger(stock) || stock! < 0)) {
      setError(t("stockInvalid"));
      return;
    }

    const body = {
      name,
      description: values.description.trim() || null,
      price,
      currency,
      stock,
      image_url: values.image_url.trim() || null,
      product_url: values.product_url.trim() || null,
      category: values.category.trim() || null,
      sku: values.sku.trim() || null,
    };

    setIsSaving(true);
    const url =
      mode === "create"
        ? `/api/companies/${companyId}/products`
        : `/api/companies/${companyId}/products/${product!.id}`;
    const res = await fetch(url, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setIsSaving(false);
    if (res?.ok) {
      const json = await res.json();
      onSaved(json.product);
    } else {
      setError(tCommon("saveError"));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Section title={t("detailsHeading")}>
        <Input
          id="product-name"
          label={t("nameLabel")}
          placeholder={t("namePlaceholder")}
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          maxLength={255}
        />
        <div>
          <Textarea
            id="product-description"
            label={t("descriptionLabel")}
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            rows={5}
          />
          <p className="mt-1.5 text-[13px] leading-5 text-on-surface-variant">{t("descriptionHint")}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            id="product-category"
            label={t("categoryLabel")}
            placeholder={t("categoryPlaceholder")}
            value={values.category}
            list="product-category-options"
            onChange={(e) => update("category", e.target.value)}
          />
          <Input
            id="product-sku"
            label={t("skuLabel")}
            value={values.sku}
            onChange={(e) => update("sku", e.target.value)}
          />
        </div>
        <datalist id="product-category-options">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </Section>

      <Section title={t("priceHeading")}>
        <div className="grid grid-cols-2 gap-3">
          <Input
            id="product-price"
            label={t("priceLabel")}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder={t("pricePlaceholder")}
            value={values.price}
            onChange={(e) => update("price", e.target.value)}
          />
          <Select
            id="product-currency"
            label={t("currencyLabel")}
            value={values.currency}
            onChange={(e) => update("currency", e.target.value)}
            options={[
              { value: "", label: t("currencyPlaceholder") },
              ...CURRENCY_CODES.map((code) => ({ value: code, label: t(`currencyOptions.${code}`) })),
            ]}
          />
        </div>
        <Input
          id="product-stock"
          label={t("stockLabel")}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder={t("stockPlaceholder")}
          value={values.stock}
          onChange={(e) => update("stock", e.target.value)}
        />
      </Section>

      <Section title={t("linksHeading")}>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Input
              id="product-image"
              label={t("imageUrlLabel")}
              type="url"
              value={values.image_url}
              onChange={(e) => update("image_url", e.target.value)}
            />
          </div>
          <ProductThumb key={values.image_url} src={values.image_url.trim() || null} className="h-11 w-11" />
        </div>
        <Input
          id="product-url"
          label={t("productUrlLabel")}
          type="url"
          value={values.product_url}
          onChange={(e) => update("product_url", e.target.value)}
        />
      </Section>

      <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-3 border-t border-outline-variant/50 bg-surface-container-lowest/95 px-6 py-4 backdrop-blur">
        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="button" isLoading={isSaving} onClick={handleSave}>
            {isSaving ? tCommon("saving") : mode === "create" ? t("createButton") : tCommon("save")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t("cancelButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}
