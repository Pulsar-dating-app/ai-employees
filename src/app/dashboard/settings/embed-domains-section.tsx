"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type EmbedDomainsSectionProps = {
  companyId: string;
  canEdit: boolean;
  initialDomains: string[];
};

// Trello M7 -- the domain allowlist behind M5's embeddable widget
// (companies.allowed_embed_domains, from M1). Whole-array-replace on save,
// same shape/semantics as FaqSection's list editor. Empty entries are
// dropped client-side before saving, same as FaqSection does for blank
// question/answer pairs -- the server (B2's PATCH) still re-validates and
// normalizes every entry regardless, this is just to avoid sending obvious
// noise.
export function EmbedDomainsSection({ companyId, canEdit, initialDomains }: EmbedDomainsSectionProps) {
  const t = useTranslations("Settings.embedDomains");
  const tCommon = useTranslations("Teach");

  const [domains, setDomains] = useState<string[]>(initialDomains.length > 0 ? initialDomains : [""]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  function updateDomain(index: number, value: string) {
    setDomains((prev) => prev.map((d, i) => (i === index ? value : d)));
  }

  function addDomain() {
    setDomains((prev) => [...prev, ""]);
  }

  function removeDomain(index: number) {
    setDomains((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveState("idle");
    setErrorDetail(null);

    const cleaned = domains.map((d) => d.trim()).filter(Boolean);

    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_embed_domains: cleaned }),
    });

    setIsSaving(false);
    if (res.ok) {
      const { company } = await res.json();
      const saved: string[] = company.allowed_embed_domains ?? [];
      setDomains(saved.length > 0 ? saved : [""]);
      setSaveState("success");
    } else {
      const body = await res.json().catch(() => null);
      setErrorDetail(body?.error ?? null);
      setSaveState("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-on-surface-variant">
          {domains.every((d) => !d.trim()) ? t("emptyStateWarning") : null}
        </p>

        {domains.map((domain, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label={index === 0 ? t("domainLabel") : undefined}
                placeholder={t("domainPlaceholder")}
                value={domain}
                onChange={(e) => updateDomain(index, e.target.value)}
                disabled={!canEdit}
                maxLength={255}
              />
            </div>
            {canEdit ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeDomain(index)}>
                {t("removeButton")}
              </Button>
            ) : null}
          </div>
        ))}

        {canEdit ? (
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={addDomain}>
              {t("addButton")}
            </Button>
          </div>
        ) : null}

        {saveState === "error" ? (
          <p role="alert" className="text-sm text-error">
            {errorDetail ?? tCommon("saveError")}
          </p>
        ) : null}

        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button type="button" isLoading={isSaving} onClick={handleSave}>
              {isSaving ? tCommon("saving") : tCommon("save")}
            </Button>
            {saveState === "success" ? (
              <span className="text-sm text-tertiary-container">{tCommon("saved")}</span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
