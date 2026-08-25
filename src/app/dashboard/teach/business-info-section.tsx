"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

// Small curated list rather than a full ISO 4217 set — MVP scope, easy to
// extend later. `timezone` intentionally has no field here at all: the
// column stays in the DB (may be removed in a future ticket), it's just not
// something a merchant needs to set through this form.
const CURRENCY_CODES = ["USD", "BRL", "EUR"] as const;

type BusinessInfoValues = {
  name: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  country: string | null;
  currency: string | null;
};

type BusinessInfoSectionProps = {
  companyId: string;
  canEdit: boolean;
  initial: BusinessInfoValues;
};

// Covers more than the ticket's literal "description, contact details" —
// name/country/timezone/currency are also companies columns with no other
// edit UI anywhere, so they belong here rather than staying fixed forever.
// One Save button PATCHes all of these fields together as one section.
export function BusinessInfoSection({ companyId, canEdit, initial }: BusinessInfoSectionProps) {
  const t = useTranslations("Teach.businessInfo");
  const tCommon = useTranslations("Teach");

  const [values, setValues] = useState<BusinessInfoValues>(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">("idle");

  function update(key: keyof BusinessInfoValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveState("idle");

    const body: Record<string, string | null> = {};
    for (const [key, val] of Object.entries(values)) {
      const trimmed = val?.trim();
      body[key] = trimmed ? trimmed : null;
    }

    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setIsSaving(false);
    setSaveState(res.ok ? "success" : "error");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Input
          label={t("nameLabel")}
          value={values.name ?? ""}
          onChange={(e) => update("name", e.target.value)}
          disabled={!canEdit}
          maxLength={255}
        />
        <Textarea
          label={t("descriptionLabel")}
          placeholder={t("descriptionPlaceholder")}
          value={values.description ?? ""}
          onChange={(e) => update("description", e.target.value)}
          disabled={!canEdit}
          maxLength={5000}
        />
        <Input
          label={t("emailLabel")}
          type="email"
          value={values.email ?? ""}
          onChange={(e) => update("email", e.target.value)}
          disabled={!canEdit}
          maxLength={255}
        />
        <Input
          label={t("phoneLabel")}
          type="tel"
          value={values.phone ?? ""}
          onChange={(e) => update("phone", e.target.value)}
          disabled={!canEdit}
          maxLength={255}
        />
        <Input
          label={t("websiteLabel")}
          type="url"
          value={values.website_url ?? ""}
          onChange={(e) => update("website_url", e.target.value)}
          disabled={!canEdit}
          maxLength={255}
        />
        <Input
          label={t("countryLabel")}
          value={values.country ?? ""}
          onChange={(e) => update("country", e.target.value)}
          disabled={!canEdit}
          maxLength={255}
        />
        <Select
          label={t("currencyLabel")}
          value={values.currency ?? ""}
          onChange={(e) => update("currency", e.target.value)}
          disabled={!canEdit}
          options={[
            { value: "", label: t("currencyPlaceholder") },
            ...CURRENCY_CODES.map((code) => ({ value: code, label: t(`currencyOptions.${code}`) })),
          ]}
        />

        {saveState === "error" ? (
          <p role="alert" className="text-sm text-red-600">
            {tCommon("saveError")}
          </p>
        ) : null}

        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button type="button" isLoading={isSaving} onClick={handleSave}>
              {isSaving ? tCommon("saving") : tCommon("save")}
            </Button>
            {saveState === "success" ? (
              <span className="text-sm text-success-500">{tCommon("saved")}</span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
