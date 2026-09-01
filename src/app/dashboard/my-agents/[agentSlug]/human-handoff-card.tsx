"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";

// Trello F5 follow-up -- companies.allow_human_handoff, saved through B2's
// existing PATCH /api/companies/[companyId] (no dedicated endpoint, same as
// every other flat company setting). Saves on change, optimistic, reverts
// on failure -- same shape as AvailabilityCard/AppointmentControlsCard.
//
// Lives here (next to AvailabilityCard, the "Customer service" card) rather
// than on the general Settings page: it's a control over how an employee
// handles conversations, same territory as pause/resume, not company
// knowledge. But the underlying flag is company-wide -- the request_human
// tool is shared by every agent (COMMON_TOOL_NAMES in tool-sets.ts), not
// agent-specific -- so this same card, and the same value, renders on every
// hired employee's own page. The copy says so explicitly rather than
// implying it's scoped to just this one hire.
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
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description", { name: agentName })}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4 rounded-lg border border-outline-variant/40 bg-surface-container-low p-4">
          <div className="mt-0.5">
            <Toggle checked={value} disabled={!canEdit || saving} label={t("toggleLabel")} onChange={change} />
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
      </CardContent>
    </Card>
  );
}
