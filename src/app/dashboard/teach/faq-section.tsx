"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type FaqEntry = { question: string; answer: string };

type FaqSectionProps = {
  companyId: string;
  canEdit: boolean;
  initialFaq: FaqEntry[] | null;
};

// Whole-array-replace on save, matching B2's semantics — no per-entry PATCH.
// Empty entries are dropped client-side before saving rather than sent and
// rejected by B2's validation.
export function FaqSection({ companyId, canEdit, initialFaq }: FaqSectionProps) {
  const t = useTranslations("Teach.faq");
  const tCommon = useTranslations("Teach");

  const [entries, setEntries] = useState<FaqEntry[]>(initialFaq ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">("idle");

  function updateEntry(index: number, field: keyof FaqEntry, value: string) {
    setEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)));
  }

  function addEntry() {
    setEntries((prev) => [...prev, { question: "", answer: "" }]);
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveState("idle");

    const cleaned = entries
      .map((entry) => ({ question: entry.question.trim(), answer: entry.answer.trim() }))
      .filter((entry) => entry.question && entry.answer);

    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faq: cleaned.length > 0 ? cleaned : null }),
    });

    setIsSaving(false);
    if (res.ok) {
      setEntries(cleaned);
      setSaveState("success");
    } else {
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
        {entries.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("emptyState")}</p>
        ) : null}

        {entries.map((entry, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
            <Input
              label={t("questionLabel")}
              value={entry.question}
              onChange={(e) => updateEntry(index, "question", e.target.value)}
              disabled={!canEdit}
              maxLength={300}
            />
            <Textarea
              label={t("answerLabel")}
              value={entry.answer}
              onChange={(e) => updateEntry(index, "answer", e.target.value)}
              disabled={!canEdit}
              maxLength={2000}
              rows={2}
            />
            {canEdit ? (
              <div>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeEntry(index)}>
                  {t("removeButton")}
                </Button>
              </div>
            ) : null}
          </div>
        ))}

        {canEdit ? (
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={addEntry}>
              {t("addButton")}
            </Button>
          </div>
        ) : null}

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
