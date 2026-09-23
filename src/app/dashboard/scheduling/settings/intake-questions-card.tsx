"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { ChevronRightIcon, PlusIcon, XIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { PREDEFINED_INTAKE_FIELDS, PREDEFINED_INTAKE_KEYS, LOCKED_INTAKE_KEYS } from "@/lib/appointments/intake-fields";
import { SettingsBlock } from "@/components/ui/settings-block";
import { useSectionStatus } from "./settings-shell";

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
  "h-10 w-full min-w-0 flex-1 rounded-xl border border-outline-variant/70 bg-surface-container-lowest px-3.5 text-sm text-on-surface outline-none transition-[border-color,box-shadow] hover:border-outline focus:border-primary focus:shadow-[0_0_0_4px_rgba(53,37,205,0.12)] read-only:cursor-not-allowed read-only:opacity-60";

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
  const tn = useTranslations("Scheduling.settings.nav");
  const initial = useMemo(() => splitFields(initialFields), [initialFields]);
  const [predefined, setPredefined] = useState<PredefinedState>(initial.predefined);
  const [custom, setCustom] = useState<CustomRow[]>(initial.custom);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = JSON.stringify({ predefined, custom: custom.map(({ label, required }) => ({ label, required })) });
  const baselineNorm = JSON.stringify({
    predefined: JSON.parse(baseline).predefined,
    custom: JSON.parse(baseline).custom.map((c: CustomRow) => ({ label: c.label, required: c.required })),
  });
  const dirty = current !== baselineNorm;

  const [savedCount, setSavedCount] = useState(
    () => PREDEFINED_INTAKE_FIELDS.filter((f) => initial.predefined[f.key].enabled).length + initial.custom.length,
  );

  useSectionStatus("intake-questions", { summary: tn("intakeCount", { count: savedCount }), warn: false });

  function touch() {
    setSavedOk(false);
    setError(null);
  }

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
    setPredefined(JSON.parse(baseline).predefined);
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
      setSavedCount(
        PREDEFINED_INTAKE_FIELDS.filter((f) => split.predefined[f.key].enabled).length + split.custom.length,
      );
      setSaving(false);
      setSavedOk(true);
    } catch {
      setError(t("saveError"));
      setSaving(false);
    }
  }

  return (
    <SettingsBlock id="intake-questions" title={t("title")} description={t("subtitle")}>
      <p className="max-w-2xl text-[13px] leading-5 text-on-surface-variant">{t("hint")}</p>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-on-surface">{t("standardHeading")}</h3>
        <ul className="flex flex-col divide-y divide-outline-variant/40 border-y border-outline-variant/40">
          {PREDEFINED_INTAKE_FIELDS.map((f) => {
            const state = predefined[f.key];
            const locked = f.locked || !canEdit;
            return (
              <li key={f.key} className="flex items-center gap-4 py-3">
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-medium text-on-surface">
                  {t(`standardLabels.${f.key}`)}
                  {f.locked ? (
                    <span className="rounded-full bg-surface-container px-2 py-0.5 text-[12px] font-medium text-on-surface-variant">
                      {t("alwaysOn")}
                    </span>
                  ) : null}
                </span>
                <span className={clsx("text-[13px]", state.required ? "text-on-surface" : "text-outline")}>
                  {t("required")}
                </span>
                <Toggle
                  checked={state.required}
                  disabled={locked}
                  label={t("requiredAria", { label: t(`standardLabels.${f.key}`) })}
                  onChange={() => setPreRequired(f.key, !state.required)}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <h3 className="text-sm font-semibold text-on-surface">{t("extraHeading")}</h3>
        {custom.length === 0 ? (
          <p className="rounded-2xl bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {custom.map((row, i) => (
              <li key={row.rowKey} className="inbox-pane-in flex items-center gap-2">
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
                <span
                  className={clsx(
                    "hidden shrink-0 pl-2 text-[13px] sm:inline",
                    row.required ? "text-on-surface" : "text-outline",
                  )}
                >
                  {t("required")}
                </span>
                <Toggle
                  checked={row.required}
                  disabled={!canEdit}
                  label={t("requiredAria", { label: row.label.trim() || t("thisQuestion") })}
                  onChange={() => toggleCustomRequired(row.rowKey)}
                />
                {canEdit ? (
                  <button
                    type="button"
                    aria-label={t("removeLabel")}
                    onClick={() => removeCustom(row.rowKey)}
                    className="shrink-0 rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit && custom.length < MAX_CUSTOM_FIELDS ? (
          <button
            type="button"
            onClick={addCustom}
            className="mt-1 inline-flex items-center gap-1 self-start rounded-lg px-1 text-[13px] font-semibold text-primary transition-colors hover:text-primary-container"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {t("add")}
          </button>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <p
            role={error ? "alert" : "status"}
            className={clsx(
              "mr-auto text-sm",
              error ? "text-error" : savedOk ? "text-success-500" : "text-on-surface-variant",
            )}
          >
            {error ?? (savedOk ? t("saved") : dirty ? t("unsaved") : "")}
          </p>
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
    </SettingsBlock>
  );
}
