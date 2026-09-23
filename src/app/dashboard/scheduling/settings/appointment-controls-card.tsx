"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Toggle } from "@/components/ui/toggle";
import { SettingsBlock } from "@/components/ui/settings-block";
import { useSectionStatus } from "./settings-shell";

type SaveState = "idle" | "saving" | "saved" | "error";

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
  const tn = useTranslations("Scheduling.settings.nav");
  const [value, setValue] = useState(initialRequiresApproval);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useSectionStatus("appointment-rules", {
    summary: value ? tn("approvalOn") : tn("approvalOff"),
    warn: false,
  });

  async function patch(payload: Record<string, unknown>): Promise<boolean> {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaveState(res.ok ? "saved" : "error");
      return res.ok;
    } catch {
      setSaveState("error");
      return false;
    }
  }

  async function change(next: boolean) {
    setValue(next);
    if (!(await patch({ requires_appointment_approval: next }))) setValue(!next);
  }

  const saving = saveState === "saving";

  return (
    <SettingsBlock
      id="appointment-rules"
      title={t("title")}
      description={t("subtitle")}
      aside={
        saveState === "idle" ? null : (
          <p
            role={saveState === "error" ? "alert" : "status"}
            className={clsx(
              "text-[13px] font-medium",
              saveState === "error"
                ? "text-error"
                : saveState === "saved"
                  ? "text-success-500"
                  : "text-on-surface-variant",
            )}
          >
            {saveState === "error" ? t("saveError") : saveState === "saved" ? t("saved") : t("saving")}
          </p>
        )
      }
    >
      <div className="flex items-start justify-between gap-6 rounded-2xl bg-surface-container-low px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-on-surface">{t("toggleLabel")}</p>
          <p className="mt-1 max-w-lg text-sm text-on-surface-variant">{t("toggleHelp")}</p>
        </div>
        <div className="pt-0.5">
          <Toggle checked={value} disabled={!canEdit || saving} label={t("toggleLabel")} onChange={change} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-2">
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
      </div>
    </SettingsBlock>
  );
}

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
  const inputId = useId();
  const helpId = useId();

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
    <div className="flex flex-col">
      <label htmlFor={inputId} className="text-sm font-semibold text-on-surface">
        {label}
      </label>
      <div className="mt-2 flex h-11 w-44 items-center rounded-xl border border-outline-variant/70 bg-surface-container-lowest transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[0_0_0_4px_rgba(53,37,205,0.12)] hover:border-outline">
        <input
          id={inputId}
          type="number"
          min={0}
          max={max}
          step={1}
          inputMode="numeric"
          aria-describedby={helpId}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="h-full min-w-0 flex-1 bg-transparent pl-3.5 text-base font-semibold tabular-nums text-on-surface outline-none [appearance:textfield] disabled:cursor-not-allowed disabled:opacity-60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="pr-3.5 text-sm text-on-surface-variant">{unit}</span>
      </div>
      <p id={helpId} className="mt-2 text-[13px] leading-5 text-on-surface-variant">
        {help}
      </p>
    </div>
  );
}
