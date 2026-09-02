"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Trello K6 -- the plain on/off switch for a hire. Flips
// company_agents.status between "active" and "paused" via PATCH
// /api/companies/:id/agents/:slug. Pausing silences the hire on every
// channel (M3's chat route gates on status === "active"), so turning it off
// goes through an inline confirm step -- same pattern as the WhatsApp
// disconnect flow. Not a router: this never touches other hires.
export function AvailabilityCard({
  companyId,
  agentSlug,
  agentName,
  initialActive,
  canEdit,
}: {
  companyId: string;
  agentSlug: string;
  agentName: string;
  initialActive: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("MyAgents.availability");
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [confirmingPause, setConfirmingPause] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Trello P6: a 402 on turning the hire back on means the plan lapsed --
  // point the merchant at billing instead of the generic retry message.
  const [needsPlan, setNeedsPlan] = useState(false);

  async function setStatus(next: "active" | "paused") {
    setSaving(true);
    setErrorMessage(null);
    setNeedsPlan(false);
    try {
      const res = await fetch(`/api/companies/${companyId}/agents/${agentSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        if (res.status === 402) setNeedsPlan(true);
        else setErrorMessage(t("updateError"));
        setSaving(false);
        return;
      }
      setActive(next === "active");
      setConfirmingPause(false);
      setSaving(false);
      // Refresh so the persona card's active/paused badge on this page (and
      // the my-team list on a back-nav) reflects the new state.
      router.refresh();
    } catch {
      setErrorMessage(t("updateError"));
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-on-surface">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                active ? "bg-tertiary-container" : "bg-on-surface-variant"
              }`}
            />
            {active ? t("activeStatus") : t("pausedStatus")}
          </span>

          {canEdit && !confirmingPause ? (
            <Button
              type="button"
              variant={active ? "secondary" : "primary"}
              size="sm"
              isLoading={saving}
              onClick={() => (active ? setConfirmingPause(true) : setStatus("active"))}
            >
              {active ? t("pauseButton") : t("activateButton")}
            </Button>
          ) : null}
        </div>

        {confirmingPause ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant pt-4">
            <p className="text-sm text-on-surface-variant">{t("pauseConfirm", { name: agentName })}</p>
            <Button
              type="button"
              variant="danger"
              size="sm"
              isLoading={saving}
              onClick={() => setStatus("paused")}
            >
              {t("pauseConfirmButton")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => {
                setConfirmingPause(false);
                setErrorMessage(null);
              }}
            >
              {t("cancel")}
            </Button>
          </div>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="text-sm text-error">
            {errorMessage}
          </p>
        ) : null}

        {needsPlan ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant pt-4">
            <p role="alert" className="text-sm text-on-surface-variant">
              {t("planRequired", { name: agentName })}
            </p>
            <Link href="/dashboard/settings/billing">
              <Button type="button" size="sm">
                {t("goToBilling")}
              </Button>
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
