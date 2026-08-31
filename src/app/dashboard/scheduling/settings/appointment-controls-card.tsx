"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SettingsIcon } from "@/components/ui/icons";
import { SettingsSection } from "./settings-section";
import { Toggle } from "./toggle";

// Trello K3 — the "Appointment Controls" card. One setting:
// companies.requires_appointment_approval, saved through B2's existing
// PATCH /api/companies/[companyId] (no dedicated endpoint — same as every
// other flat company setting). Saves on change, optimistic, reverts on
// failure, matching the Stitch screen which shows no save button here.
export function AppointmentControlsCard({
  companyId,
  canEdit,
  initialRequiresApproval,
}: {
  companyId: string;
  canEdit: boolean;
  initialRequiresApproval: boolean;
}) {
  const t = useTranslations("Scheduling.settings.approval");
  const [value, setValue] = useState(initialRequiresApproval);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setValue(next);
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requires_appointment_approval: next }),
      });
      if (!res.ok) {
        setValue(!next);
        setError(t("saveError"));
      }
    } catch {
      setValue(!next);
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      icon={SettingsIcon}
      iconTone="secondary"
      title={t("title")}
      subtitle={t("subtitle")}
    >
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
          {error ? (
            <p role="alert" className="mt-2 text-sm text-error">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </SettingsSection>
  );
}
