"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Toggle } from "@/components/ui/toggle";
import { SettingsBlock } from "@/components/ui/settings-block";

export function HumanHandoffCard({
  companyId,
  agentName,
  canEdit,
  initialAllowHumanHandoff,
}: {
  companyId: string;
  agentName: string;
  canEdit: boolean;
  initialAllowHumanHandoff: boolean;
}) {
  const t = useTranslations("MyAgents.humanHandoff");
  const [value, setValue] = useState(initialAllowHumanHandoff);
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
        body: JSON.stringify({ allow_human_handoff: next }),
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
    <SettingsBlock id="human-handoff" title={t("title")} description={t("description", { name: agentName })}>
      <div className="flex items-start justify-between gap-6 rounded-2xl bg-surface-container-low px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-on-surface">{t("toggleLabel")}</p>
          <p className="mt-1 max-w-xl text-sm text-on-surface-variant">{t("toggleHelp")}</p>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-error">
              {error}
            </p>
          ) : null}
        </div>
        <div className="pt-0.5">
          <Toggle checked={value} disabled={!canEdit || saving} label={t("toggleLabel")} onChange={change} />
        </div>
      </div>
    </SettingsBlock>
  );
}
