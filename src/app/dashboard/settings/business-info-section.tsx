"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { COUNTRY_CODES, countryName } from "@/lib/geo/countries";
import { useCompanyAutosave, SaveStatusLine } from "./company-autosave";
import { SettingsBlock } from "./settings-block";
import { useReportFilled } from "./settings-shell";
const CURRENCY_CODES = ["USD", "BRL", "EUR"] as const;
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
export function BusinessInfoSection({ companyId, canEdit, initial }: BusinessInfoSectionProps) {
  const t = useTranslations("Teach.businessInfo");
  const tBlocks = useTranslations("Settings.blocks");
  const reportFilled = useReportFilled();
  const locale = useLocale();
  const { status, save } = useCompanyAutosave(companyId);

  const [values, setValues] = useState<BusinessInfoValues>(initial);
  const [saved, setSaved] = useState<BusinessInfoValues>(initial);
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
  async function commit(key: keyof BusinessInfoValues, next?: string) {
    const raw = next ?? values[key] ?? "";
    const normalized = raw.trim() ? raw.trim() : null;
    if (normalized === saved[key]) return;
    if (await save({ [key]: normalized })) {
      setSaved((prev) => ({ ...prev, [key]: normalized }));
      if (key === "description") reportFilled("about", Boolean(normalized));
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
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value),
      onBlur: () => void commit(key),
    };
  }

  return (
    <>
      <SettingsBlock
        id="about"
        title={tBlocks("aboutTitle")}
        description={tBlocks("aboutDescription")}
        aside={canEdit ? <SaveStatusLine status={status} /> : null}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input id="business-name" label={t("nameLabel")} maxLength={255} {...textProps("name")} />
          <Input
            id="business-industry"
            label={t("industryLabel")}
            placeholder={t("industryPlaceholder")}
            maxLength={255}
            {...textProps("industry")}
          />
        </div>
        <Textarea
          id="business-description"
          label={t("descriptionLabel")}
          placeholder={t("descriptionPlaceholder")}
          maxLength={5000}
          rows={4}
          {...textProps("description")}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            id="business-currency"
            label={t("currencyLabel")}
            options={[
              { value: "", label: t("currencyPlaceholder") },
              ...CURRENCY_CODES.map((code) => ({ value: code, label: t(`currencyOptions.${code}`) })),
            ]}
            {...selectProps("currency")}
          />
          <div className="flex flex-col gap-1.5">
            <Select
              id="business-timezone"
              label={t("timezoneLabel")}
              options={[
                { value: "", label: t("timezonePlaceholder") },
                ...TIMEZONES.map((tz) => ({ value: tz, label: t(`timezoneOptions.${tz}`) })),
              ]}
              {...selectProps("timezone")}
            />
            <p className="text-[13px] text-on-surface-variant">{t("timezoneHint")}</p>
          </div>
        </div>
      </SettingsBlock>

      <SettingsBlock
        id="contact"
        title={tBlocks("contactTitle")}
        description={tBlocks("contactDescription")}
        aside={canEdit ? <SaveStatusLine status={status} /> : null}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input id="business-email" label={t("emailLabel")} type="email" maxLength={255} {...textProps("email")} />
          <Input id="business-phone" label={t("phoneLabel")} type="tel" maxLength={255} {...textProps("phone")} />
          <Input
            id="business-website"
            label={t("websiteLabel")}
            type="url"
            maxLength={255}
            {...textProps("website_url")}
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
        </div>
        <Textarea
          id="business-address"
          label={t("addressLabel")}
          placeholder={t("addressPlaceholder")}
          rows={2}
          maxLength={255}
          {...textProps("address")}
        />
      </SettingsBlock>
    </>
  );
}
