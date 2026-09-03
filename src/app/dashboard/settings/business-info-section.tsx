"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { COUNTRY_CODES, countryName } from "@/lib/geo/countries";
import { useCompanyAutosave, SaveStatusLine } from "./company-autosave";

// Small curated lists rather than the full ISO 4217 set — MVP scope.
const CURRENCY_CODES = ["USD", "BRL", "EUR"] as const;

// The distinct Brazilian offsets (no DST anywhere since 2019) plus a couple
// for merchants abroad. New companies default to America/Sao_Paulo, so this
// field is an override, not a required step.
const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Noronha",
  "America/Rio_Branco",
  "America/New_York",
  "Europe/Lisbon",
  "UTC",
] as const;

type BusinessInfoValues = {
  name: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  address: string | null;
  country: string | null;
  industry: string | null;
  currency: string | null;
  timezone: string | null;
};

type BusinessInfoSectionProps = {
  companyId: string;
  canEdit: boolean;
  initial: BusinessInfoValues;
};

// Company-wide profile fields, each column of `companies` with no other edit
// UI. Saves per field on blur (selects on change) — no Save button; a
// single status line at the foot of the card reports the last write. See
// company-autosave.tsx.
export function BusinessInfoSection({ companyId, canEdit, initial }: BusinessInfoSectionProps) {
  const t = useTranslations("Teach.businessInfo");
  const locale = useLocale();
  const { status, save } = useCompanyAutosave(companyId);

  const [values, setValues] = useState<BusinessInfoValues>(initial);
  const [saved, setSaved] = useState<BusinessInfoValues>(initial);

  // Localised country names come from the runtime's CLDR data (Intl), so
  // only the code list is bundled. Sorted by the localised label.
  const countryOptions = useMemo(() => {
    const collator = new Intl.Collator(locale);
    const opts: { value: string; label: string }[] = [];
    for (const code of COUNTRY_CODES) {
      const label = countryName(code, locale);
      if (label) opts.push({ value: code, label });
    }
    return opts.sort((a, b) => collator.compare(a.label, b.label));
  }, [locale]);

  function set(key: keyof BusinessInfoValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  // Commit one field if it actually changed. `next` lets a select pass its
  // new value straight through without waiting on a state update.
  async function commit(key: keyof BusinessInfoValues, next?: string) {
    const raw = next ?? values[key] ?? "";
    const normalized = raw.trim() ? raw.trim() : null;
    if (normalized === saved[key]) return;
    if (await save({ [key]: normalized })) {
      setSaved((prev) => ({ ...prev, [key]: normalized }));
    }
  }

  function selectProps(key: keyof BusinessInfoValues) {
    return {
      value: values[key] ?? "",
      disabled: !canEdit,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
        set(key, e.target.value);
        void commit(key, e.target.value);
      },
    };
  }

  function textProps(key: keyof BusinessInfoValues) {
    return {
      value: values[key] ?? "",
      disabled: !canEdit,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        set(key, e.target.value),
      onBlur: () => void commit(key),
    };
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Input label={t("nameLabel")} maxLength={255} {...textProps("name")} />
        <Textarea
          label={t("descriptionLabel")}
          placeholder={t("descriptionPlaceholder")}
          maxLength={5000}
          {...textProps("description")}
        />
        <Input label={t("emailLabel")} type="email" maxLength={255} {...textProps("email")} />
        <Input label={t("phoneLabel")} type="tel" maxLength={255} {...textProps("phone")} />
        <Input label={t("websiteLabel")} type="url" maxLength={255} {...textProps("website_url")} />
        <Textarea
          label={t("addressLabel")}
          placeholder={t("addressPlaceholder")}
          rows={2}
          maxLength={255}
          {...textProps("address")}
        />
        <Combobox
          label={t("countryLabel")}
          value={values.country ?? ""}
          onChange={(value) => {
            set("country", value);
            void commit("country", value);
          }}
          options={countryOptions}
          disabled={!canEdit}
          placeholder={t("countryPlaceholder")}
          searchPlaceholder={t("countrySearchPlaceholder")}
          emptyText={t("countryNoResults")}
        />
        <Input
          label={t("industryLabel")}
          placeholder={t("industryPlaceholder")}
          maxLength={255}
          {...textProps("industry")}
        />
        <Select
          label={t("currencyLabel")}
          options={[
            { value: "", label: t("currencyPlaceholder") },
            ...CURRENCY_CODES.map((code) => ({ value: code, label: t(`currencyOptions.${code}`) })),
          ]}
          {...selectProps("currency")}
        />
        <div className="flex flex-col gap-1">
          <Select
            label={t("timezoneLabel")}
            options={[
              { value: "", label: t("timezonePlaceholder") },
              ...TIMEZONES.map((tz) => ({ value: tz, label: t(`timezoneOptions.${tz}`) })),
            ]}
            {...selectProps("timezone")}
          />
          <p className="text-sm text-on-surface-variant">{t("timezoneHint")}</p>
        </div>

        {canEdit ? <SaveStatusLine status={status} /> : null}
      </CardContent>
    </Card>
  );
}
