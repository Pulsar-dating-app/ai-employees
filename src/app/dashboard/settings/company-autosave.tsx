"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon } from "@/components/ui/icons";

// Save-on-blur for the company settings cards: no per-card Save button. A
// field commits (PATCH /api/companies/:id with just its own key) when it
// loses focus and its value actually changed; selects/comboboxes commit on
// change. One status line per card reflects the most recent write.
export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useCompanyAutosave(companyId: string) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pending = useRef(0);

  const save = useCallback(
    async (patch: Record<string, unknown>): Promise<boolean> => {
      pending.current += 1;
      setStatus("saving");
      try {
        const res = await fetch(`/api/companies/${companyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        pending.current -= 1;
        if (!res.ok) {
          setStatus("error");
          return false;
        }
        // Only announce "saved" once nothing else is still in flight, so a
        // burst of quick edits settles on one final state.
        if (pending.current === 0) setStatus("saved");
        return true;
      } catch {
        pending.current -= 1;
        setStatus("error");
        return false;
      }
    },
    [companyId],
  );

  return { status, save };
}

export function SaveStatusLine({ status }: { status: SaveStatus }) {
  const t = useTranslations("Teach");
  if (status === "idle") return null;
  if (status === "error") {
    return (
      <p role="alert" className="text-sm text-error">
        {t("autosaveError")}
      </p>
    );
  }
  return (
    <p
      className="flex items-center gap-1.5 text-sm text-on-surface-variant"
      aria-live="polite"
    >
      {status === "saved" ? <CheckIcon className="h-4 w-4 text-tertiary" /> : null}
      {status === "saving" ? t("saving") : t("autosaveSaved")}
    </p>
  );
}
