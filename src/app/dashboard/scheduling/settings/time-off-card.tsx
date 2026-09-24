"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { PlusIcon, XIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { SettingsBlock } from "@/components/ui/settings-block";
import { useSectionStatus } from "./settings-shell";

export type TimeOffEntry = {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
};

const FIELD_CLASSES =
  "h-11 w-full rounded-xl border border-outline-variant/70 bg-surface-container-lowest px-3.5 text-sm text-on-surface outline-none transition-[border-color,box-shadow] hover:border-outline focus:border-primary focus:shadow-[0_0_0_4px_rgba(53,37,205,0.12)] disabled:cursor-not-allowed disabled:opacity-60";

const DAY_MS = 86_400_000;

function byStartDate(a: TimeOffEntry, b: TimeOffEntry) {
  return a.start_date.localeCompare(b.start_date);
}

function dayCount(entry: TimeOffEntry) {
  return (
    Math.round((Date.parse(`${entry.end_date}T00:00:00Z`) - Date.parse(`${entry.start_date}T00:00:00Z`)) / DAY_MS) + 1
  );
}

export function TimeOffCard({
  companyId,
  canEdit,
  initialEntries,
  professionalId = null,
  title,
  description,
}: {
  companyId: string;
  canEdit: boolean;
  initialEntries: TimeOffEntry[];
  // 2026-09-24 -- set to manage one professional's own time off (only they
  // are away) instead of the establishment's closures.
  professionalId?: string | null;
  title?: string;
  description?: string;
}) {
  const t = useTranslations("Scheduling.settings.timeOff");
  const tn = useTranslations("Scheduling.settings.nav");
  const locale = useLocale();
  const [entries, setEntries] = useState<TimeOffEntry[]>(() => [...initialEntries].sort(byStartDate));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSectionStatus("time-off", {
    summary: entries.length === 0 ? tn("timeOffNone") : tn("timeOffCount", { count: entries.length }),
    warn: false,
  });

  const fmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" });
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "2-digit" });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short" });
  const asDate = (d: string) => new Date(`${d}T00:00:00`);

  function formatRange(entry: TimeOffEntry) {
    const start = fmt.format(asDate(entry.start_date));
    if (entry.start_date === entry.end_date) return start;
    return `${start} ${t("rangeSeparator")} ${fmt.format(asDate(entry.end_date))}`;
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
        body: JSON.stringify({ startDate, endDate, reason: reason.trim() || undefined, professionalId }),
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
    <SettingsBlock id="time-off" title={title ?? t("title")} description={description ?? t("subtitle")}>
      {entries.length === 0 ? (
        <p className="rounded-2xl bg-surface-container-low px-4 py-5 text-sm text-on-surface-variant">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/40 border-y border-outline-variant/40">
          {entries.map((entry) => (
            <li key={entry.id} className="inbox-pane-in flex items-center gap-4 py-3">
              <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-fixed text-primary">
                <span className="text-base font-semibold leading-none tabular-nums">
                  {dayFmt.format(asDate(entry.start_date))}
                </span>
                <span className="mt-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide">
                  {monthFmt.format(asDate(entry.start_date)).replace(".", "")}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-on-surface">{formatRange(entry)}</p>
                <p className="truncate text-[13px] text-on-surface-variant">
                  {t("dayCount", { count: dayCount(entry) })}
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  aria-label={t("removeLabel")}
                  onClick={() => remove(entry.id)}
                  className="shrink-0 rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-col gap-3 pt-2">
          <h3 className="text-sm font-semibold text-on-surface">{t("addHeading")}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto] md:items-end">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-on-surface-variant">
              {t("startLabel")}
              <input
                type="date"
                className={FIELD_CLASSES}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-on-surface-variant">
              {t("endLabel")}
              <input
                type="date"
                className={FIELD_CLASSES}
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1.5 text-[13px] font-medium text-on-surface-variant md:col-span-1">
              {t("reasonLabel")}
              <input
                type="text"
                className={FIELD_CLASSES}
                placeholder={t("reasonPlaceholder")}
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button type="button" onClick={add} isLoading={adding} className="col-span-2 h-11 md:col-span-1">
              <PlusIcon className="h-4 w-4" />
              {adding ? t("adding") : t("addButton")}
            </Button>
          </div>
          <p className="text-[13px] text-on-surface-variant">{t("reasonHint")}</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </SettingsBlock>
  );
}
