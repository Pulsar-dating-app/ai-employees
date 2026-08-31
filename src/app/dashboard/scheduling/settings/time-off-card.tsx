"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarIcon, PlusIcon, XIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "./settings-section";

export type TimeOffEntry = {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
};

const DATE_INPUT_CLASSES =
  "h-10 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 text-sm text-on-surface outline-none transition-colors focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60";

function byStartDate(a: TimeOffEntry, b: TimeOffEntry) {
  return a.start_date.localeCompare(b.start_date);
}

// Trello K3 (time-off extension) — merchant-registered closures. Backed by
// `company_time_off` + /api/companies/[id]/time-off; the availability engine
// folds these date ranges into the same `busy` list as appointments and
// Google free/busy, so Ana stops offering and booking them.
export function TimeOffCard({
  companyId,
  canEdit,
  initialEntries,
}: {
  companyId: string;
  canEdit: boolean;
  initialEntries: TimeOffEntry[];
}) {
  const t = useTranslations("Scheduling.settings.timeOff");
  const locale = useLocale();
  const [entries, setEntries] = useState<TimeOffEntry[]>(() => [...initialEntries].sort(byStartDate));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" });
  function formatRange(entry: TimeOffEntry) {
    // Parse as local wall-clock — the value is a plain calendar date, no zone.
    const start = fmt.format(new Date(`${entry.start_date}T00:00:00`));
    if (entry.start_date === entry.end_date) return start;
    const end = fmt.format(new Date(`${entry.end_date}T00:00:00`));
    return `${start} ${t("rangeSeparator")} ${end}`;
  }

  async function add() {
    if (!startDate || !endDate) {
      setError(t("missingDates"));
      return;
    }
    if (endDate < startDate) {
      setError(t("invalidRange"));
      return;
    }
    // No calendar-level date disabling with a native <input type="date">, so
    // guard here: inclusive ranges overlap when each starts on or before the
    // other ends.
    const clash = entries.find((e) => startDate <= e.end_date && endDate >= e.start_date);
    if (clash) {
      setError(t("overlap", { range: formatRange(clash) }));
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/time-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        setError(t("saveError"));
        setAdding(false);
        return;
      }
      const { timeOff } = (await res.json()) as { timeOff: TimeOffEntry };
      setEntries((prev) => [...prev, timeOff].sort(byStartDate));
      setStartDate("");
      setEndDate("");
      setReason("");
      setAdding(false);
    } catch {
      setError(t("saveError"));
      setAdding(false);
    }
  }

  async function remove(id: string) {
    const prev = entries;
    setEntries((cur) => cur.filter((e) => e.id !== id));
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/time-off/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setEntries(prev);
        setError(t("saveError"));
      }
    } catch {
      setEntries(prev);
      setError(t("saveError"));
    }
  }

  return (
    <SettingsSection icon={CalendarIcon} title={t("title")} subtitle={t("subtitle")}>
      <div className="flex flex-col gap-3">
        {entries.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t("empty")}</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant/40 bg-surface-container-low p-3"
            >
              <div className="min-w-0">
                <p className="text-body-md font-medium text-on-surface">{formatRange(entry)}</p>
                {entry.reason ? (
                  <p className="truncate text-label-md text-on-surface-variant">{entry.reason}</p>
                ) : null}
              </div>
              {canEdit ? (
                <button
                  type="button"
                  aria-label={t("removeLabel")}
                  onClick={() => remove(entry.id)}
                  className="shrink-0 rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {canEdit ? (
        <>
        <div className="mt-6 flex flex-col gap-3 border-t border-outline-variant/40 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-xs font-semibold text-on-surface-variant">
            {t("startLabel")}
            <input
              type="date"
              className={DATE_INPUT_CLASSES}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-on-surface-variant">
            {t("endLabel")}
            <input
              type="date"
              className={DATE_INPUT_CLASSES}
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-semibold text-on-surface-variant">
            {t("reasonLabel")}
            <input
              type="text"
              className={DATE_INPUT_CLASSES}
              placeholder={t("reasonPlaceholder")}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button type="button" size="sm" onClick={add} isLoading={adding} className="sm:mb-0.5">
            <PlusIcon className="h-4 w-4" />
            {adding ? t("adding") : t("addButton")}
          </Button>
        </div>
        <p className="mt-2 text-label-sm text-on-surface-variant">{t("reasonHint")}</p>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-error">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  );
}
