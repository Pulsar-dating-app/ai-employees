"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SettingsIcon } from "@/components/ui/icons";
import { Toggle } from "@/components/ui/toggle";
import { SettingsSection } from "./settings-section";

// Trello K3 / J7 — the "Appointment Controls" card. Settings, all on B2's
// existing PATCH /api/companies/[companyId] (no dedicated endpoint — same as
// every other flat company setting):
//  - requires_appointment_approval (K3): toggle, saves on change.
//  - min_lead_time_minutes / cancellation_cutoff_hours (J7): whole numbers,
//    0 = no restriction, save on blur, revert on failure.
export function AppointmentControlsCard({
  companyId,
  canEdit,
  initialRequiresApproval,
  initialMinLeadTimeMinutes,
  initialCancellationCutoffHours,
}: {
  companyId: string;
  canEdit: boolean;
  initialRequiresApproval: boolean;
  initialMinLeadTimeMinutes: number;
  initialCancellationCutoffHours: number;
}) {
  const t = useTranslations("Scheduling.settings.approval");
  const [value, setValue] = useState(initialRequiresApproval);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(payload: Record<string, unknown>): Promise<boolean> {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(t("saveError"));
        return false;
      }
      return true;
    } catch {
      setError(t("saveError"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function change(next: boolean) {
    setValue(next);
    if (!(await patch({ requires_appointment_approval: next }))) setValue(!next);
  }

  return (
    <SettingsSection
      icon={SettingsIcon}
      iconTone="secondary"
      title={t("title")}
      subtitle={t("subtitle")}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4 rounded-lg border border-outline-variant/40 bg-surface-container-low p-4">
          <div className="mt-0.5">
            <Toggle
              checked={value}
              disabled={!canEdit || saving}
              label={t("toggleLabel")}
              onChange={change}
            />
          </div>
          <div>
            <button
              type="button"
              disabled={!canEdit || saving}
              onClick={() => change(!value)}
              className="block text-left text-body-md font-medium text-on-surface disabled:cursor-not-allowed"
            >
              {t("toggleLabel")}
            </button>
            <p className="mt-1 text-label-md text-on-surface-variant">{t("toggleHelp")}</p>
          </div>
        </div>

        <PolicyNumberField
          label={t("leadTimeLabel")}
          help={t("leadTimeHelp")}
          unit={t("minutesUnit")}
          initial={initialMinLeadTimeMinutes}
          max={43_200}
          disabled={!canEdit || saving}
          onCommit={(n) => patch({ min_lead_time_minutes: n })}
        />
        <PolicyNumberField
          label={t("cancelCutoffLabel")}
          help={t("cancelCutoffHelp")}
          unit={t("hoursUnit")}
          initial={initialCancellationCutoffHours}
          max={8_760}
          disabled={!canEdit || saving}
          onCommit={(n) => patch({ cancellation_cutoff_hours: n })}
        />

        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
      </div>
    </SettingsSection>
  );
}

// A single whole-number policy field. Commits on blur only when the value
// actually changed and is a valid non-negative integer; reverts on a failed
// save so the input never drifts from what's stored.
function PolicyNumberField({
  label,
  help,
  unit,
  initial,
  max,
  disabled,
  onCommit,
}: {
  label: string;
  help: string;
  unit: string;
  initial: number;
  max: number;
  disabled: boolean;
  onCommit: (n: number) => Promise<boolean>;
}) {
  const [text, setText] = useState(String(initial));
  const [committed, setCommitted] = useState(initial);

  async function commit() {
    const n = Number(text);
    if (!Number.isInteger(n) || n < 0 || n > max) {
      setText(String(committed));
      return;
    }
    if (n === committed) return;
    if (await onCommit(n)) {
      setCommitted(n);
    } else {
      setText(String(committed));
    }
  }

  return (
    <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-4">
      <label className="block text-body-md font-medium text-on-surface">{label}</label>
      <p className="mt-1 text-label-md text-on-surface-variant">{help}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={max}
          step={1}
          inputMode="numeric"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-24 rounded-md border border-outline-variant bg-surface px-2 py-1 text-body-md text-on-surface disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span className="text-label-md text-on-surface-variant">{unit}</span>
      </div>
    </div>
  );
}
