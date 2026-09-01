"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRightIcon, ListIcon, PlusIcon, XIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { SettingsSection } from "./settings-section";

export type IntakeField = {
  id: string;
  label: string;
  is_required: boolean;
  position: number;
};

// Trello K8 — the "Intake questions" section. An editable, reorderable list
// of customer details the scheduling agent must collect before booking:
// each row is just a free-text label ("Full name", "CPF") plus a
// required/optional switch. Backed by
// `appointment_intake_fields` + GET/PUT /api/companies/[id]/intake-fields,
// whole-list-replace like business hours (no field types / validation /
// per-service overrides for MVP). Member-level, matching the rest of the
// screen. Reproduces the Stitch "Scheduling Settings" screen's Intake
// questions card (project 17743086378683250734).

const MAX_FIELDS = 30;
const MAX_LABEL_LENGTH = 120;

const LABEL_INPUT_CLASSES =
  "h-10 w-full min-w-0 flex-1 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 text-sm text-on-surface outline-none transition-colors focus:ring-2 focus:ring-primary/40 read-only:cursor-not-allowed read-only:opacity-60";

type Row = { key: string; label: string; required: boolean };

let keySeq = 0;
const freshKey = () => `new-${(keySeq += 1)}`;

function toRows(fields: IntakeField[]): Row[] {
  return fields.map((f) => ({ key: f.id, label: f.label, required: f.is_required }));
}

function rowsEqual(a: Row[], b: Row[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row.label === b[i].label && row.required === b[i].required);
}

export function IntakeQuestionsCard({
  companyId,
  canEdit,
  initialFields,
}: {
  companyId: string;
  canEdit: boolean;
  initialFields: IntakeField[];
}) {
  const t = useTranslations("Scheduling.settings.intake");
  const [rows, setRows] = useState<Row[]>(() => toRows(initialFields));
  const [baseline, setBaseline] = useState<Row[]>(rows);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = !rowsEqual(rows, baseline);

  function mutate(next: Row[]) {
    setRows(next);
    setSavedOk(false);
    setError(null);
  }

  function updateLabel(key: string, value: string) {
    mutate(rows.map((r) => (r.key === key ? { ...r, label: value.slice(0, MAX_LABEL_LENGTH) } : r)));
  }

  function toggleRequired(key: string) {
    mutate(rows.map((r) => (r.key === key ? { ...r, required: !r.required } : r)));
  }

  function remove(key: string) {
    mutate(rows.filter((r) => r.key !== key));
  }

  function add() {
    if (rows.length >= MAX_FIELDS) return;
    mutate([...rows, { key: freshKey(), label: "", required: false }]);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = rows.slice();
    [next[index], next[target]] = [next[target], next[index]];
    mutate(next);
  }

  function cancel() {
    setRows(baseline);
    setSavedOk(false);
    setError(null);
  }

  async function save() {
    const trimmed = rows.map((r) => ({ ...r, label: r.label.trim() }));
    if (trimmed.some((r) => r.label === "")) {
      setError(t("blankLabel"));
      return;
    }
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const res = await fetch(`/api/companies/${companyId}/intake-fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeFields: trimmed.map((r) => ({ label: r.label, is_required: r.required })),
        }),
      });
      if (!res.ok) {
        setError(t("saveError"));
        setSaving(false);
        return;
      }
      const { intakeFields } = (await res.json()) as { intakeFields: IntakeField[] };
      const saved = toRows(intakeFields);
      setRows(saved);
      setBaseline(saved);
      setSaving(false);
      setSavedOk(true);
    } catch {
      setError(t("saveError"));
      setSaving(false);
    }
  }

  return (
    <SettingsSection icon={ListIcon} title={t("title")} subtitle={t("subtitle")}>
      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t("empty")}</p>
        ) : (
          rows.map((row, i) => (
            <div
              key={row.key}
              className="flex items-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-container-low p-2"
            >
              {canEdit ? (
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label={t("moveUp")}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="rounded p-0.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronRightIcon className="h-4 w-4 -rotate-90" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveDown")}
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                    className="rounded p-0.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronRightIcon className="h-4 w-4 rotate-90" />
                  </button>
                </div>
              ) : null}

              <input
                type="text"
                className={LABEL_INPUT_CLASSES}
                value={row.label}
                readOnly={!canEdit}
                maxLength={MAX_LABEL_LENGTH}
                placeholder={t("labelPlaceholder")}
                aria-label={t("labelAria", { position: i + 1 })}
                onChange={(e) => updateLabel(row.key, e.target.value)}
              />

              <label className="flex shrink-0 items-center gap-2 pl-1 pr-1">
                <span className="text-label-md text-on-surface-variant">{t("required")}</span>
                <Toggle
                  checked={row.required}
                  disabled={!canEdit}
                  label={t("requiredAria", { label: row.label.trim() || t("thisQuestion") })}
                  onChange={() => toggleRequired(row.key)}
                />
              </label>

              {canEdit ? (
                <button
                  type="button"
                  aria-label={t("removeLabel")}
                  onClick={() => remove(row.key)}
                  className="shrink-0 rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))
        )}

        {canEdit && rows.length < MAX_FIELDS ? (
          <button
            type="button"
            onClick={add}
            className="mt-1 inline-flex items-center gap-1 self-start text-label-md font-medium text-primary transition-colors hover:text-primary-container"
          >
            <PlusIcon className="h-4 w-4" />
            {t("add")}
          </button>
        ) : null}
      </div>

      {canEdit ? (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-outline-variant/40 pt-4">
          {error ? (
            <p role="alert" className="mr-auto text-sm text-error">
              {error}
            </p>
          ) : savedOk ? (
            <p className="mr-auto text-sm text-tertiary">{t("saved")}</p>
          ) : dirty ? (
            <p className="mr-auto text-sm italic text-on-surface-variant">{t("unsaved")}</p>
          ) : null}
          {dirty ? (
            <Button type="button" variant="ghost" onClick={cancel} disabled={saving}>
              {t("cancel")}
            </Button>
          ) : null}
          <Button type="button" onClick={save} isLoading={saving} disabled={!dirty}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      ) : null}
    </SettingsSection>
  );
}
