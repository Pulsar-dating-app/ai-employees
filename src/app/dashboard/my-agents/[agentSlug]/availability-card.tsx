"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";

const SECONDARY =
  "inline-flex h-10 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest px-4 text-label-md font-semibold text-on-surface transition-[border-color,color] hover:border-primary/40 hover:text-primary disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function AvailabilityControl({
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
      router.refresh();
    } catch {
      setErrorMessage(t("updateError"));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          role="status"
          className={clsx(
            "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold",
            active ? "bg-success-100 text-success-500" : "bg-surface-container text-on-surface-variant",
          )}
        >
          <span
            aria-hidden="true"
            className={clsx("h-2 w-2 rounded-full", active ? "inbox-live-dot bg-success-500" : "bg-outline")}
          />
          {active ? t("responding") : t("pausedStatus")}
        </span>
        {canEdit && !confirmingPause ? (
          active ? (
            <button type="button" disabled={saving} onClick={() => setConfirmingPause(true)} className={SECONDARY}>
              {t("pauseButton")}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => setStatus("active")}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-label-md font-semibold text-on-primary shadow-[0_8px_20px_-10px_rgba(53,37,205,0.7)] transition-[filter] hover:brightness-110 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t("activateButton")}
            </button>
          )
        ) : null}
      </div>

      {confirmingPause ? (
        <div className="inbox-pane-in flex flex-col gap-3 rounded-2xl bg-surface-container-low p-4">
          <p className="text-sm text-on-surface">{t("pauseConfirm", { name: agentName })}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setStatus("paused")}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-error px-4 text-label-sm font-semibold text-on-error transition-[filter] hover:brightness-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t("pauseConfirmButton")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setConfirmingPause(false);
                setErrorMessage(null);
              }}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-label-sm font-semibold text-on-surface transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="text-sm text-error">
          {errorMessage}
        </p>
      ) : null}

      {needsPlan ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-4">
          <p role="alert" className="text-sm text-on-surface">
            {t("planRequired", { name: agentName })}
          </p>
          <Link href="/dashboard/settings/billing" className="text-sm font-semibold text-primary hover:underline">
            {t("goToBilling")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
