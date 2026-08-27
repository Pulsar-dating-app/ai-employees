"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { KeyValuesEditor, normalizeKeyValues, type KeyValues } from "./key-values-editor";
import type { Product } from "./products-manager";

// Small curated list, same as business-info-section.tsx's currency field —
// not a full ISO 4217 set, easy to extend later.
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
  onSaved: (product: Product) => void;
  onCancel: () => void;
};

// Shared create/edit form — used both inside "Add product"'s collapsible
// panel and inline in place of a row in ProductList when editing. Always
// sends the full field set on save (create or edit): PATCH's merge-patch
// semantics tolerate resending unchanged values, so there's no need for a
// separate diffing layer to track what actually changed.
export function ProductForm({ companyId, mode, companyCurrency, product, onSaved, onCancel }: ProductFormProps) {
  const t = useTranslations("Products.form");
  const tCommon = useTranslations("Products");

  const [values, setValues] = useState<FormValues>(toFormValues(product, companyCurrency));
  const [variants, setVariants] = useState<KeyValues | null>(() => normalizeKeyValues(product?.variants));
  const [attributes, setAttributes] = useState<KeyValues | null>(() => normalizeKeyValues(product?.attributes));
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

    const body = {
      name,
      description: values.description.trim() || null,
      price: values.price.trim() ? Number(values.price) : null,
      currency: values.currency.trim() || null,
      stock: values.stock.trim() ? Number(values.stock) : null,
      image_url: values.image_url.trim() || null,
      product_url: values.product_url.trim() || null,
      category: values.category.trim() || null,
      sku: values.sku.trim() || null,
      variants,
      attributes,
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
    });

    setIsSaving(false);
    if (res.ok) {
      const json = await res.json();
      onSaved(json.product);
    } else {
      setError(tCommon("saveError"));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Input label={t("nameLabel")} value={values.name} onChange={(e) => update("name", e.target.value)} maxLength={255} />
      <Textarea
        label={t("descriptionLabel")}
        value={values.description}
        onChange={(e) => update("description", e.target.value)}
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Input
            label={t("priceLabel")}
            type="number"
            min="0"
            step="0.01"
            value={values.price}
            onChange={(e) => update("price", e.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Select
            label={t("currencyLabel")}
            value={values.currency}
            onChange={(e) => update("currency", e.target.value)}
            options={[
              { value: "", label: t("currencyPlaceholder") },
              ...CURRENCY_CODES.map((code) => ({ value: code, label: t(`currencyOptions.${code}`) })),
            ]}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Input
            label={t("stockLabel")}
            type="number"
            min="0"
            step="1"
            placeholder={t("stockPlaceholder")}
            value={values.stock}
            onChange={(e) => update("stock", e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Input label={t("categoryLabel")} value={values.category} onChange={(e) => update("category", e.target.value)} />
        </div>
        <div className="min-w-0 flex-1">
          <Input label={t("skuLabel")} value={values.sku} onChange={(e) => update("sku", e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Input
            label={t("imageUrlLabel")}
            type="url"
            value={values.image_url}
            onChange={(e) => update("image_url", e.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Input
            label={t("productUrlLabel")}
            type="url"
            value={values.product_url}
            onChange={(e) => update("product_url", e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div>
          <span className="text-sm font-medium text-neutral-900">{t("variantsLabel")}</span>
          <p className="text-xs text-neutral-500">{t("variantsHint")}</p>
        </div>
        <KeyValuesEditor
          initialValue={variants}
          onChange={setVariants}
          keyLabel={t("variantsOptionLabel")}
          keyPlaceholder={t("variantsOptionPlaceholder")}
          valuePlaceholder={t("variantsValuePlaceholder")}
          addValueButton={t("addValueButton")}
          addRowButton={t("variantsAddOptionButton")}
          removeRowButton={t("removeOptionButton")}
          removeValueLabel={t("removeValueLabel")}
          emptyState={t("emptyOptionsState")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div>
          <span className="text-sm font-medium text-neutral-900">{t("attributesLabel")}</span>
          <p className="text-xs text-neutral-500">{t("attributesHint")}</p>
        </div>
        <KeyValuesEditor
          initialValue={attributes}
          onChange={setAttributes}
          keyLabel={t("attributesOptionLabel")}
          keyPlaceholder={t("attributesOptionPlaceholder")}
          valuePlaceholder={t("attributesValuePlaceholder")}
          addValueButton={t("addValueButton")}
          addRowButton={t("attributesAddOptionButton")}
          removeRowButton={t("removeOptionButton")}
          removeValueLabel={t("removeValueLabel")}
          emptyState={t("emptyOptionsState")}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="button" isLoading={isSaving} onClick={handleSave}>
          {isSaving ? tCommon("saving") : tCommon("save")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("cancelButton")}
        </Button>
      </div>
    </div>
  );
}
