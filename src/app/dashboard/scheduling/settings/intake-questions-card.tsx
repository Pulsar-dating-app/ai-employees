"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRightIcon, ListIcon, PlusIcon, XIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  PREDEFINED_INTAKE_FIELDS,
  PREDEFINED_INTAKE_KEYS,
  LOCKED_INTAKE_KEYS,
} from "@/lib/appointments/intake-fields";
import { SettingsSection } from "./settings-section";

// Trello K8 / R2 — the "Intake questions" section. Two parts:
//   * Standard fields: the fixed predefined set (email / name / phone /
//     cpf / date of birth). Merchant toggles enable + required. Email is
//     locked on+required.
//   * Extra questions: free-text custom questions, add/reorder/remove.
// Backed by appointment_intake_fields + GET/PUT /api/companies/[id]/intake-fields.

export type IntakeField = {
  id: string;
  key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  is_enabled: boolean;
  position: number;
};

const MAX_CUSTOM_FIELDS = 25;
const MAX_LABEL_LENGTH = 120;

const LABEL_INPUT_CLASSES =
  "h-10 w-full min-w-0 flex-1 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 text-sm text-on-surface outline-none transition-colors focus:ring-2 focus:ring-primary/40 read-only:cursor-not-allowed read-only:opacity-60";

type PredefinedState = Record<string, { enabled: boolean; required: boolean }>;
type CustomRow = { rowKey: string; label: string; required: boolean };

let seq = 0;
const freshKey = () => `new-${(seq += 1)}`;

function splitFields(fields: IntakeField[]): { predefined: PredefinedState; custom: CustomRow[] } {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const predefined: PredefinedState = {};
  for (const f of PREDEFINED_INTAKE_FIELDS) {
    const row = byKey.get(f.key);
    predefined[f.key] = {
      enabled: row ? row.is_enabled : f.defaultEnabled,
      required: row ? row.is_required : f.defaultRequired,
    };
  }
  const custom = fields
    .filter((f) => !PREDEFINED_INTAKE_KEYS.has(f.key))
    .sort((a, b) => a.position - b.position)
    .map((f) => ({ rowKey: f.id, label: f.label, required: f.is_required }));
  return { predefined, custom };
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
  const initial = useMemo(() => splitFields(initialFields), [initialFields]);
  const [predefined, setPredefined] = useState<PredefinedState>(initial.predefined);
  const [custom, setCustom] = useState<CustomRow[]>(initial.custom);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = JSON.stringify({ predefined, custom: custom.map(({ label, required }) => ({ label, required })) });
  const baselineNorm = JSON.stringify({
    predefined: initial.predefined,
    custom: JSON.parse(baseline).custom.map((c: CustomRow) => ({ label: c.label, required: c.required })),
  });
  const dirty = current !== baselineNorm;

  function touch() {
    setSavedOk(false);
    setError(null);
  }

  // Standard fields are one switch now: "Required". A merchant only turns a
  // field on because they want it answered, so "collect but optional" was a
  // distinction without a purpose — required and enabled move together.
  function setPreRequired(key: string, required: boolean) {
    if (LOCKED_INTAKE_KEYS.has(key)) return;
    touch();
    setPredefined((p) => ({ ...p, [key]: { enabled: required, required } }));
  }

  function updateCustomLabel(rowKey: string, value: string) {
    touch();
    setCustom((rows) => rows.map((r) => (r.rowKey === rowKey ? { ...r, label: value.slice(0, MAX_LABEL_LENGTH) } : r)));
  }
  function toggleCustomRequired(rowKey: string) {
    touch();
    setCustom((rows) => rows.map((r) => (r.rowKey === rowKey ? { ...r, required: !r.required } : r)));
  }
  function removeCustom(rowKey: string) {
    touch();
    setCustom((rows) => rows.filter((r) => r.rowKey !== rowKey));
  }
  function addCustom() {
    if (custom.length >= MAX_CUSTOM_FIELDS) return;
    touch();
    setCustom((rows) => [...rows, { rowKey: freshKey(), label: "", required: true }]);
  }
  function moveCustom(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= custom.length) return;
    touch();
    setCustom((rows) => {
      const next = rows.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function cancel() {
    setPredefined(initial.predefined);
    setCustom(JSON.parse(baseline).custom);
    setSavedOk(false);
    setError(null);
  }

  async function save() {
    const trimmed = custom.map((r) => ({ ...r, label: r.label.trim() }));
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
          predefined: PREDEFINED_INTAKE_FIELDS.map((f) => ({
            key: f.key,
            is_enabled: predefined[f.key].enabled,
            is_required: predefined[f.key].required,
          })),
          custom: trimmed.map((r) => ({ label: r.label, is_required: r.required })),
        }),
      });
      if (!res.ok) {
        setError(t("saveError"));
        setSaving(false);
        return;
      }
      const { intakeFields } = (await res.json()) as { intakeFields: IntakeField[] };
      const split = splitFields(intakeFields);
      setPredefined(split.predefined);
      setCustom(split.custom);
      setBaseline(JSON.stringify(split));
      setSaving(false);
      setSavedOk(true);
    } catch {
      setError(t("saveError"));
      setSaving(false);
    }
  }

  return (
    <SettingsSection id="intake-questions" icon={ListIcon} title={t("title")} subtitle={t("subtitle")}>
      <p className="mb-4 rounded-lg bg-surface-container-low px-3 py-2 text-label-md text-on-surface-variant">
        {t("hint")}
      </p>

      {/* Standard fields */}
      <h3 className="mb-2 text-label-lg font-medium text-on-surface">{t("standardHeading")}</h3>
      <div className="mb-6 flex flex-col gap-2">
        {PREDEFINED_INTAKE_FIELDS.map((f) => {
          const state = predefined[f.key];
          const locked = f.locked || !canEdit;
          return (
            <div
              key={f.key}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-outline-variant/40 bg-surface-container-low p-3"
            >
              <span className="min-w-32 flex-1 text-sm font-medium text-on-surface">
                {t(`standardLabels.${f.key}`)}
                {f.locked ? (
                  <span className="ml-2 text-label-md font-normal text-on-surface-variant">{t("alwaysOn")}</span>
                ) : null}
              </span>
              <label className="flex items-center gap-2">
                <span className="text-label-md text-on-surface-variant">{t("required")}</span>
                <Toggle
                  checked={state.required}
                  disabled={locked}
                  label={t("requiredAria", { label: t(`standardLabels.${f.key}`) })}
                  onChange={() => setPreRequired(f.key, !state.required)}
                />
              </label>
            </div>
          );
        })}
      </div>

      {/* Extra questions */}
      <h3 className="mb-2 text-label-lg font-medium text-on-surface">{t("extraHeading")}</h3>
      <div className="flex flex-col gap-2">
        {custom.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t("empty")}</p>
        ) : (
          custom.map((row, i) => (
            <div
              key={row.rowKey}
              className="flex items-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-container-low p-2"
            >
              {canEdit ? (
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label={t("moveUp")}
                    disabled={i === 0}
                    onClick={() => moveCustom(i, -1)}
                    className="rounded p-0.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronRightIcon className="h-4 w-4 -rotate-90" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveDown")}
                    disabled={i === custom.length - 1}
                    onClick={() => moveCustom(i, 1)}
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
                onChange={(e) => updateCustomLabel(row.rowKey, e.target.value)}
              />
              <label className="flex shrink-0 items-center gap-2 px-1">
                <span className="text-label-md text-on-surface-variant">{t("required")}</span>
                <Toggle
                  checked={row.required}
                  disabled={!canEdit}
                  label={t("requiredAria", { label: row.label.trim() || t("thisQuestion") })}
                  onChange={() => toggleCustomRequired(row.rowKey)}
                />
              </label>
              {canEdit ? (
                <button
                  type="button"
                  aria-label={t("removeLabel")}
                  onClick={() => removeCustom(row.rowKey)}
                  className="shrink-0 rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))
        )}

        {canEdit && custom.length < MAX_CUSTOM_FIELDS ? (
          <button
            type="button"
            onClick={addCustom}
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
