"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type PolicyField = "shipping_policy" | "return_policy" | "payment_policy" | "additional_information";
type SectionKey = "shipping" | "returns" | "payments" | "other";

type PolicySectionProps = {
  companyId: string;
  fieldName: PolicyField;
  sectionKey: SectionKey;
  initialValue: string | null;
  canEdit: boolean;
};

// Reused for the four sections that are each a single free-text companies
// column (Shipping/Returns/Payments/Other) — structurally identical, only
// the field name and translated copy differ. Each instance saves and
// reports success/failure independently, per the ticket's explicit
// per-section feedback requirement.
export function PolicySection({
  companyId,
  fieldName,
  sectionKey,
  initialValue,
  canEdit,
}: PolicySectionProps) {
  const t = useTranslations(`Teach.${sectionKey}`);
  const tCommon = useTranslations("Teach");

  const [value, setValue] = useState(initialValue ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">("idle");

  async function handleSave() {
    setIsSaving(true);
    setSaveState("idle");

    const trimmed = value.trim();
    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [fieldName]: trimmed ? trimmed : null }),
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
        <Textarea
          label={t("label")}
          placeholder={t("placeholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!canEdit}
          maxLength={5000}
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
