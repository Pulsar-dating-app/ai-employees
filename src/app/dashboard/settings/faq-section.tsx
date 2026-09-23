"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { CheckIcon, ChevronRightIcon, PlusIcon, XIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SettingsBlock } from "./settings-block";
import { useReportFilled } from "./settings-shell";

type FaqEntry = { key: number; question: string; answer: string };

function withKeys(entries: { question: string; answer: string }[] | null): FaqEntry[] {
  return (entries ?? []).map((entry, index) => ({ ...entry, key: index }));
}

export function FaqSection({
  companyId,
  canEdit,
  initialFaq,
}: {
  companyId: string;
  canEdit: boolean;
  initialFaq: { question: string; answer: string }[] | null;
}) {
  const t = useTranslations("Teach.faq");
  const tCommon = useTranslations("Teach");
  const tSettings = useTranslations("Settings.faq");
  const reportFilled = useReportFilled();

  const [entries, setEntries] = useState<FaqEntry[]>(() => withKeys(initialFaq));
  const nextKey = useRef(initialFaq?.length ?? 0);
  const [open, setOpen] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">("idle");

  function updateEntry(key: number, field: "question" | "answer", value: string) {
    setEntries((prev) => prev.map((entry) => (entry.key === key ? { ...entry, [field]: value } : entry)));
    setDirty(true);
    setSaveState("idle");
  }

  function addEntry() {
    const entry = { key: nextKey.current++, question: "", answer: "" };
    setEntries((prev) => [...prev, entry]);
    setOpen(entry.key);
    setDirty(true);
    setSaveState("idle");
  }

  function removeEntry(key: number) {
    setEntries((prev) => prev.filter((entry) => entry.key !== key));
    setDirty(true);
    setSaveState("idle");
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveState("idle");
    const cleaned = entries
      .map((entry) => ({ key: entry.key, question: entry.question.trim(), answer: entry.answer.trim() }))
      .filter((entry) => entry.question && entry.answer);

    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        faq: cleaned.length > 0 ? cleaned.map(({ question, answer }) => ({ question, answer })) : null,
      }),
    }).catch(() => null);

    setIsSaving(false);
    if (res?.ok) {
      setEntries(cleaned);
      setDirty(false);
      setSaveState("success");
      reportFilled("faq", cleaned.length > 0);
    } else {
      setSaveState("error");
    }
  }

  return (
    <SettingsBlock
      id="faq"
      title={t("title")}
      description={t("description")}
      aside={
        entries.length > 0 ? (
          <span className="text-[13px] font-medium text-on-surface-variant">
            {tSettings("count", { count: entries.length })}
          </span>
        ) : null
      }
    >
      {entries.length === 0 ? (
        <p className="rounded-2xl bg-surface-container-low px-4 py-3.5 text-sm text-on-surface-variant">
          {t("emptyState")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/50 overflow-hidden rounded-2xl border border-outline-variant/60">
          {entries.map((entry) => {
            const expanded = open === entry.key;
            return (
              <li key={entry.key} className={clsx("transition-colors", expanded && "bg-surface-container-low/60")}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : entry.key)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                >
                  <ChevronRightIcon
                    className={clsx(
                      "h-4 w-4 shrink-0 text-on-surface-variant transition-transform duration-200",
                      expanded && "rotate-90",
                    )}
                  />
                  <span
                    className={clsx(
                      "min-w-0 flex-1 truncate text-[15px] font-medium",
                      entry.question.trim() ? "text-on-surface" : "text-outline",
                    )}
                  >
                    {entry.question.trim() || tSettings("untitled")}
                  </span>
                </button>
                {expanded ? (
                  <div className="inbox-pane-in flex flex-col gap-3 px-4 pb-4 pl-11">
                    <Input
                      id={`faq-question-${entry.key}`}
                      label={t("questionLabel")}
                      value={entry.question}
                      onChange={(e) => updateEntry(entry.key, "question", e.target.value)}
                      disabled={!canEdit}
                      maxLength={300}
                    />
                    <Textarea
                      id={`faq-answer-${entry.key}`}
                      label={t("answerLabel")}
                      value={entry.answer}
                      onChange={(e) => updateEntry(entry.key, "answer", e.target.value)}
                      disabled={!canEdit}
                      maxLength={2000}
                      rows={3}
                    />
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.key)}
                        className="inline-flex h-9 items-center gap-1.5 self-start rounded-xl px-3 text-label-sm font-semibold text-on-surface-variant transition-colors hover:bg-error-container/60 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                        {t("removeButton")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={addEntry}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 text-label-md font-semibold text-on-surface transition-[border-color,color] hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <PlusIcon className="h-4 w-4" />
            {t("addButton")}
          </button>
          {dirty ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-label-md font-semibold text-on-primary shadow-[0_8px_20px_-10px_rgba(53,37,205,0.7)] transition-[filter] hover:brightness-110 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {isSaving ? <span className="onboarding-loader" /> : null}
              {tSettings("saveChanges")}
            </button>
          ) : null}
          {dirty && !isSaving ? (
            <span className="text-[13px] text-on-surface-variant">{tSettings("unsaved")}</span>
          ) : null}
          {saveState === "success" && !dirty ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-on-surface-variant" aria-live="polite">
              <CheckIcon className="h-4 w-4 text-success-500" />
              {tCommon("saved")}
            </span>
          ) : null}
        </div>
      ) : null}

      {saveState === "error" ? (
        <p role="alert" className="text-sm text-error">
          {tCommon("saveError")}
        </p>
      ) : null}
    </SettingsBlock>
  );
}
