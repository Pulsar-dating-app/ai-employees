"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { useCompanyAutosave, SaveStatusLine } from "./company-autosave";
import { SettingsBlock } from "@/components/ui/settings-block";
import { useReportFilled } from "./settings-shell";

type PolicyField = "shipping_policy" | "return_policy" | "payment_policy" | "additional_information";
type SectionKey = "shipping" | "returns" | "payments" | "other";

type PolicySectionProps = {
  companyId: string;
  fieldName: PolicyField;
  sectionKey: SectionKey;
  initialValue: string | null;
  canEdit: boolean;
};
export function PolicySection({ companyId, fieldName, sectionKey, initialValue, canEdit }: PolicySectionProps) {
  const t = useTranslations(`Teach.${sectionKey}`);
  const { status, save } = useCompanyAutosave(companyId);
  const reportFilled = useReportFilled();

  const [value, setValue] = useState(initialValue ?? "");
  const [saved, setSaved] = useState(initialValue ?? "");

  async function commit() {
    const normalized = value.trim() ? value.trim() : null;
    if ((normalized ?? "") === saved) return;
    if (await save({ [fieldName]: normalized })) {
      setSaved(normalized ?? "");
      if (sectionKey === "payments" || sectionKey === "other") reportFilled(sectionKey, Boolean(normalized));
    }
  }

  return (
    <SettingsBlock
      id={sectionKey}
      title={t("title")}
      description={t("description")}
      aside={canEdit ? <SaveStatusLine status={status} /> : null}
    >
      <Textarea
        id={`policy-${sectionKey}`}
        label={t("label")}
        placeholder={t("placeholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        disabled={!canEdit}
        maxLength={5000}
        rows={4}
      />
    </SettingsBlock>
  );
}
