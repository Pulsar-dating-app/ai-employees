"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useCompanyAutosave, SaveStatusLine } from "./company-autosave";

type PolicyField = "shipping_policy" | "return_policy" | "payment_policy" | "additional_information";
type SectionKey = "shipping" | "returns" | "payments" | "other";

type PolicySectionProps = {
  companyId: string;
  fieldName: PolicyField;
  sectionKey: SectionKey;
  initialValue: string | null;
  canEdit: boolean;
};

// Reused for the single-free-text-column sections (Shipping / Returns /
// Payments / Other). Saves on blur — no Save button — with a status line at
// the foot of the card. See company-autosave.tsx.
export function PolicySection({
  companyId,
  fieldName,
  sectionKey,
  initialValue,
  canEdit,
}: PolicySectionProps) {
  const t = useTranslations(`Teach.${sectionKey}`);
  const { status, save } = useCompanyAutosave(companyId);

  const [value, setValue] = useState(initialValue ?? "");
  const [saved, setSaved] = useState(initialValue ?? "");

  async function commit() {
    const normalized = value.trim() ? value.trim() : null;
    if ((normalized ?? "") === saved) return;
    if (await save({ [fieldName]: normalized })) setSaved(normalized ?? "");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          label={t("label")}
          placeholder={t("placeholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          disabled={!canEdit}
          maxLength={5000}
        />
        {canEdit ? <SaveStatusLine status={status} /> : null}
      </CardContent>
    </Card>
  );
}
