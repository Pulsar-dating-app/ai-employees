"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Service } from "./services-manager";

// Same curated list as ProductForm / business-info-section.
const CURRENCY_CODES = ["USD", "BRL", "EUR"] as const;

type FormValues = {
  name: string;
  description: string;
  duration_minutes: string;
  buffer_minutes: string;
  price: string;
  currency: string;
  category: string;
};

function toFormValues(service: Service | undefined, companyCurrency: string | null): FormValues {
  return {
    name: service?.name ?? "",
    description: service?.description ?? "",
    duration_minutes: service?.duration_minutes != null ? String(service.duration_minutes) : "",
    buffer_minutes: service?.buffer_minutes != null ? String(service.buffer_minutes) : "",
    price: service?.price != null ? String(service.price) : "",
    currency: service?.currency ?? companyCurrency ?? "",
    category: service?.category ?? "",
  };
}

type ServiceFormProps = {
  companyId: string;
  mode: "create" | "edit";
  companyCurrency: string | null;
  service?: Service;
  onSaved: (service: Service) => void;
  onCancel: () => void;
};

// Shared create/edit form, same contract as ProductForm: always sends the
// full field set, since PATCH's merge semantics tolerate resending unchanged
// values and there's no diffing layer to maintain.
//
// Two rules are validated here rather than left to a generic save error,
// because both are easy to trip and the API's message isn't merchant-facing:
// duration is required and must be a positive whole number, and a price
// can't be saved without a currency (H1 enforces both, returning 400).
export function ServiceForm({ companyId, mode, companyCurrency, service, onSaved, onCancel }: ServiceFormProps) {
  const t = useTranslations("Services.form");
  const tCommon = useTranslations("Services");

  const [values, setValues] = useState<FormValues>(toFormValues(service, companyCurrency));
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

    const duration = Number(values.duration_minutes);
    if (!values.duration_minutes.trim() || !Number.isInteger(duration) || duration <= 0) {
      setError(t("durationRequired"));
      return;
    }

    // buffer_minutes is never null on the wire: PATCH validates it strictly
    // whenever the key is present, and blank means "no buffer" = 0.
    const buffer = values.buffer_minutes.trim() ? Number(values.buffer_minutes) : 0;
    if (!Number.isInteger(buffer) || buffer < 0) {
      setError(t("bufferInvalid"));
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

    const body = {
      name,
      description: values.description.trim() || null,
      duration_minutes: duration,
      buffer_minutes: buffer,
      price,
      currency,
      category: values.category.trim() || null,
    };

    setIsSaving(true);
    const url =
      mode === "create"
        ? `/api/companies/${companyId}/services`
        : `/api/companies/${companyId}/services/${service!.id}`;

    const res = await fetch(url, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setIsSaving(false);
    if (res.ok) {
      const json = await res.json();
      onSaved(json.service);
    } else {
      setError(tCommon("saveError"));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        label={t("nameLabel")}
        placeholder={t("namePlaceholder")}
        value={values.name}
        onChange={(e) => update("name", e.target.value)}
        maxLength={255}
      />
      <Textarea
        label={t("descriptionLabel")}
        value={values.description}
        onChange={(e) => update("description", e.target.value)}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Input
            label={t("durationLabel")}
            type="number"
            min="1"
            step="1"
            placeholder={t("durationPlaceholder")}
            value={values.duration_minutes}
            onChange={(e) => update("duration_minutes", e.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Input
            label={t("bufferLabel")}
            type="number"
            min="0"
            step="1"
            placeholder={t("bufferPlaceholder")}
            value={values.buffer_minutes}
            onChange={(e) => update("buffer_minutes", e.target.value)}
          />
        </div>
      </div>
      <p className="-mt-1 text-xs text-on-surface-variant">{t("bufferHint")}</p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Input
            label={t("priceLabel")}
            type="number"
            min="0"
            step="0.01"
            placeholder={t("pricePlaceholder")}
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
            label={t("categoryLabel")}
            placeholder={t("categoryPlaceholder")}
            value={values.category}
            onChange={(e) => update("category", e.target.value)}
          />
        </div>
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
