"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ServiceTips } from "@/components/services/service-tips";
import { ChevronDownIcon, LightbulbIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import clsx from "clsx";
import type { Service } from "./services-manager";

const CURRENCY_CODES = ["USD", "BRL", "EUR"] as const;
// One tap for the usual lengths; "other" opens a number field.
const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

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
    // Brazil-first: with no company currency set, a price still saves in
    // reais instead of failing on a currency field tucked under "more options".
    currency: service?.currency ?? companyCurrency ?? "BRL",
    category: service?.category ?? "",
  };
}

type ServiceFormProps = {
  companyId: string;
  mode: "create" | "edit";
  companyCurrency: string | null;
  service?: Service;
  categories: string[];
  // 2026-09-24 -- active professionals, for "who performs this service".
  // With one (or none) the field is hidden: everyone performs everything.
  professionals?: { id: string; name: string }[];
  onSaved: (service: Service) => void;
  onCancel: () => void;
};

export function ServiceForm({
  companyId,
  mode,
  companyCurrency,
  service,
  categories,
  professionals = [],
  onSaved,
  onCancel,
}: ServiceFormProps) {
  const t = useTranslations("Services.form");
  const tCommon = useTranslations("Services");

  const [values, setValues] = useState<FormValues>(toFormValues(service, companyCurrency));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Empty = every professional performs it.
  const [professionalIds, setProfessionalIds] = useState<string[]>(service?.professional_ids ?? []);
  const showProfessionals = professionals.length > 1;
  // The fields most services never need start folded; editing a service that
  // already uses one opens them.
  const [showMore, setShowMore] = useState(
    Boolean(service && (service.buffer_minutes || service.category || service.professional_ids?.length)),
  );
  const [customDuration, setCustomDuration] = useState(
    Boolean(values.duration_minutes) && !DURATION_PRESETS.includes(Number(values.duration_minutes)),
  );

  function toggleProfessional(id: string) {
    setProfessionalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

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

    const buffer = values.buffer_minutes.trim() ? Number(values.buffer_minutes) : 0;
    if (!Number.isInteger(buffer) || buffer < 0) {
      setError(t("bufferInvalid"));
      return;
    }

    const hasPrice = values.price.trim() !== "";
    // A phone's decimal keyboard in Portuguese types "51,79".
    const price = hasPrice ? Number(values.price.trim().replace(",", ".")) : null;
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
      ...(showProfessionals ? { professionalIds } : {}),
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

  // Advice, never validation: these never block saving. They only show once
  // a name is being typed, so an empty form isn't a wall of warnings.
  const hasName = values.name.trim().length > 0;
  const nameIsOneWord = hasName && values.name.trim().split(/\s+/).length === 1;

  // Phone-first (2026-10-26): what every service needs -- name, price,
  // duration, description -- up front; buffer, currency, category and who
  // performs it under "more options"; the save bar pinned to the bottom of
  // the drawer instead of after all of it.
  return (
    <div className="flex flex-col gap-4">
      <ServiceTips collapsible />
      <Input
        id="service-name"
        label={t("nameLabel")}
        placeholder={t("namePlaceholder")}
        value={values.name}
        onChange={(e) => update("name", e.target.value)}
        maxLength={255}
      />
      {nameIsOneWord ? <Nudge>{t("nudges.shortName")}</Nudge> : null}

      <Input
        id="service-price"
        label={t("priceLabelWithCurrency", { currency: values.currency || "BRL" })}
        inputMode="decimal"
        placeholder={t("pricePlaceholder")}
        value={values.price}
        onChange={(e) => update("price", e.target.value)}
      />
      {hasName && !values.price.trim() ? <Nudge>{t("nudges.noPrice")}</Nudge> : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-semibold text-on-surface-variant">{t("durationLabel")}</legend>
        <div className="flex flex-wrap gap-2">
          {DURATION_PRESETS.map((minutes) => {
            const selected = !customDuration && values.duration_minutes === String(minutes);
            return (
              <button
                key={minutes}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setCustomDuration(false);
                  update("duration_minutes", String(minutes));
                }}
                className={chipClass(selected)}
              >
                {t("durationChip", { minutes })}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customDuration}
            onClick={() => setCustomDuration(true)}
            className={chipClass(customDuration)}
          >
            {t("durationOther")}
          </button>
        </div>
        {customDuration ? (
          <Input
            id="service-duration"
            aria-label={t("durationLabel")}
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            placeholder={t("durationPlaceholder")}
            value={values.duration_minutes}
            onChange={(e) => update("duration_minutes", e.target.value)}
          />
        ) : null}
      </fieldset>

      <Textarea
        id="service-description"
        label={t("descriptionLabel")}
        placeholder={t("descriptionPlaceholder")}
        value={values.description}
        onChange={(e) => update("description", e.target.value)}
        rows={3}
      />
      {hasName && !values.description.trim() ? <Nudge>{t("nudges.noDescription")}</Nudge> : null}

      <button
        type="button"
        onClick={() => setShowMore((open) => !open)}
        aria-expanded={showMore}
        className="flex w-fit items-center gap-1 text-sm font-semibold text-primary"
      >
        {showMore ? t("lessOptions") : t("moreOptions")}
        <ChevronDownIcon className={clsx("h-4 w-4 transition-transform", showMore && "rotate-180")} />
      </button>

      {showMore ? (
        <div className="flex flex-col gap-4 rounded-2xl bg-surface-container-low p-4">
          <div className="flex flex-col gap-1">
            <Input
              id="service-buffer"
              label={t("bufferLabel")}
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              placeholder={t("bufferPlaceholder")}
              value={values.buffer_minutes}
              onChange={(e) => update("buffer_minutes", e.target.value)}
            />
            <p className="text-xs text-on-surface-variant">{t("bufferHint")}</p>
          </div>
          <Select
            id="service-currency"
            label={t("currencyLabel")}
            value={values.currency}
            onChange={(e) => update("currency", e.target.value)}
            options={CURRENCY_CODES.map((code) => ({ value: code, label: t(`currencyOptions.${code}`) }))}
          />
          <Input
            id="service-category"
            label={t("categoryLabel")}
            placeholder={t("categoryPlaceholder")}
            value={values.category}
            list="service-category-options"
            onChange={(e) => update("category", e.target.value)}
          />
          <datalist id="service-category-options">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>

          {showProfessionals ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-semibold text-on-surface-variant">{t("professionalsLabel")}</legend>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={professionalIds.length === 0}
                  onClick={() => setProfessionalIds([])}
                  className={chipClass(professionalIds.length === 0)}
                >
                  {t("professionalsAll")}
                </button>
                {professionals.map((p) => {
                  const selected = professionalIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleProfessional(p.id)}
                      className={chipClass(selected)}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[12px] text-on-surface-variant">{t("professionalsHint")}</p>
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      {/* Pinned to the bottom of the drawer (its scroll container), edge to
          edge over the drawer body's px-6/py-6. */}
      <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex items-center gap-3 border-t border-outline-variant/50 bg-surface-container-lowest/95 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Button type="button" isLoading={isSaving} onClick={handleSave} className="flex-1 sm:flex-none">
          {isSaving ? tCommon("saving") : tCommon("save")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("cancelButton")}
        </Button>
      </div>
    </div>
  );
}

function chipClass(selected: boolean) {
  return clsx(
    "min-h-10 rounded-full border px-4 text-sm font-medium transition-colors",
    selected
      ? "border-primary bg-primary-fixed text-primary"
      : "border-outline-variant text-on-surface-variant hover:border-outline",
  );
}

function Nudge({ children }: { children: React.ReactNode }) {
  return (
    <p className="-mt-1 flex items-start gap-1.5 text-xs text-[#9a6412]">
      <LightbulbIcon className="mt-px h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}
