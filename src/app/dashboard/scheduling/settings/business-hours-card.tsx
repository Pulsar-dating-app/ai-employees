"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { PlusIcon, XIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { CHEVRON } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { SettingsBlock } from "@/components/ui/settings-block";
import { useSectionStatus } from "./settings-shell";

export type BusinessHourRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

const DISPLAY_DAYS = [
  { key: "monday", dow: 1 },
  { key: "tuesday", dow: 2 },
  { key: "wednesday", dow: 3 },
  { key: "thursday", dow: 4 },
  { key: "friday", dow: 5 },
  { key: "saturday", dow: 6 },
  { key: "sunday", dow: 0 },
] as const;

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";
const DAY_MINUTES = 24 * 60;
const HOUR_MARKS = [0, 6, 12, 18, 24];

const TIME_SELECT_CLASSES =
  "h-10 rounded-xl border border-outline-variant/70 bg-surface-container-lowest pl-3 text-sm tabular-nums text-on-surface outline-none transition-[border-color,box-shadow] hover:border-outline focus:border-primary focus:shadow-[0_0_0_4px_rgba(53,37,205,0.12)] disabled:cursor-not-allowed disabled:opacity-60";

type TimeRange = { start: string; end: string };
type DayState = { key: string; dow: number; open: boolean; ranges: TimeRange[] };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHhMm(total: number): string {
  const t = Math.max(0, Math.min(total, 23 * 60 + 59));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 0; m < DAY_MINUTES; m += 15) out.push(toHhMm(m));
  out.push("23:59");
  return out;
})();

function TimeSelect({
  value,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: string;
  disabled: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={clsx(TIME_SELECT_CLASSES, CHEVRON)}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {TIME_OPTIONS.includes(value) ? null : <option value={value}>{value}</option>}
      {TIME_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function cascadeForward(ranges: TimeRange[], fromIndex: number): TimeRange[] {
  const next = ranges.slice();
  for (let i = fromIndex + 1; i < next.length; i += 1) {
    const prevEnd = toMinutes(next[i - 1].end);
    if (toMinutes(next[i].start) >= prevEnd) break;
    const length = Math.max(toMinutes(next[i].end) - toMinutes(next[i].start), 60);
    next[i] = { start: toHhMm(prevEnd), end: toHhMm(prevEnd + length) };
  }
  return next;
}

function buildInitialState(rows: BusinessHourRow[]): DayState[] {
  return DISPLAY_DAYS.map(({ key, dow }) => {
    const ranges = rows
      .filter((r) => r.day_of_week === dow && r.is_active)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((r) => ({ start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) }));
    return {
      key,
      dow,
      open: ranges.length > 0,
      ranges: ranges.length > 0 ? ranges : [{ start: DEFAULT_START, end: DEFAULT_END }],
    };
  });
}

function DayTimeline({ day }: { day: DayState }) {
  return (
    <div aria-hidden="true" className="relative h-2 rounded-full bg-surface-container">
      {day.open
        ? day.ranges.map((range, i) => {
            const start = toMinutes(range.start);
            const end = Math.max(start, toMinutes(range.end));
            return (
              <span
                key={i}
                className="absolute inset-y-0 rounded-full bg-primary-container transition-[left,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ left: `${(start / DAY_MINUTES) * 100}%`, width: `${((end - start) / DAY_MINUTES) * 100}%` }}
              />
            );
          })
        : null}
    </div>
  );
}

export function BusinessHoursCard({
  companyId,
  canEdit,
  initialRows,
  professionalId = null,
  title,
  description,
}: {
  companyId: string;
  canEdit: boolean;
  initialRows: BusinessHourRow[];
  // 2026-09-24 -- set to edit one professional's own schedule instead of the
  // establishment's hours (the professional page reuses this card).
  professionalId?: string | null;
  title?: string;
  description?: string;
}) {
  const t = useTranslations("Scheduling.settings.businessHours");
  const tn = useTranslations("Scheduling.settings.nav");
  const [days, setDays] = useState<DayState[]>(() => buildInitialState(initialRows));
  const [savedOpenDays, setSavedOpenDays] = useState(() => buildInitialState(initialRows).filter((d) => d.open).length);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSectionStatus("business-hours", {
    summary: savedOpenDays > 0 ? tn("hoursOpen", { count: savedOpenDays }) : tn("hoursClosed"),
    warn: savedOpenDays === 0,
  });

  function mutate(key: string, fn: (day: DayState) => DayState) {
    setDays((prev) => prev.map((d) => (d.key === key ? fn(d) : d)));
    setDirty(true);
    setSavedOk(false);
    setError(null);
  }

  function setRange(key: string, index: number, patch: Partial<TimeRange>) {
    mutate(key, (d) => {
      const current = d.ranges[index];
      let edited = { ...current, ...patch };
      if ("start" in patch && toMinutes(edited.start) >= toMinutes(edited.end)) {
        const length = Math.max(toMinutes(current.end) - toMinutes(current.start), 60);
        edited = { ...edited, end: toHhMm(toMinutes(edited.start) + length) };
      }
      const ranges = d.ranges.map((r, i) => (i === index ? edited : r));
      return { ...d, ranges: cascadeForward(ranges, index) };
    });
  }

  function addRange(key: string) {
    mutate(key, (d) => {
      const last = d.ranges[d.ranges.length - 1];
      const start = last ? last.end : DEFAULT_START;
      return { ...d, ranges: [...d.ranges, { start, end: toHhMm(toMinutes(start) + 60) }] };
    });
  }

  function removeRange(key: string, index: number) {
    mutate(key, (d) => ({ ...d, ranges: d.ranges.filter((_, i) => i !== index) }));
  }

  function firstProblem(): string | null {
    for (const d of days) {
      if (!d.open) continue;
      for (const r of d.ranges) {
        if (r.end <= r.start) return t("invalidRange");
      }
      const sorted = [...d.ranges].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i].start < sorted[i - 1].end) {
          return t("overlap", { day: t(`days.${d.key}`) });
        }
      }
    }
    return null;
  }

  async function save() {
    const problem = firstProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const businessHours = days
        .filter((d) => d.open)
        .flatMap((d) => d.ranges.map((r) => ({ day_of_week: d.dow, start_time: r.start, end_time: r.end })));
      const query = professionalId ? `?professionalId=${encodeURIComponent(professionalId)}` : "";
      const res = await fetch(`/api/companies/${companyId}/business-hours${query}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessHours }),
      });
      setSaving(false);
      if (!res.ok) {
        setError(t("saveError"));
        return;
      }
      setSavedOk(true);
      setDirty(false);
      setSavedOpenDays(days.filter((d) => d.open).length);
    } catch {
      setError(t("saveError"));
      setSaving(false);
    }
  }

  return (
    <SettingsBlock id="business-hours" title={title ?? t("title")} description={description ?? t("subtitle")}>
      <div className="flex flex-col">
        <div aria-hidden="true" className="hidden grid-cols-[168px_minmax(0,1fr)_296px] gap-x-6 pb-2 md:grid">
          <span />
          <div className="relative h-4 text-[11px] tabular-nums text-outline">
            {HOUR_MARKS.map((h) => (
              <span
                key={h}
                className={clsx("absolute top-0", h === 0 ? "left-0" : h === 24 ? "right-0" : "-translate-x-1/2")}
                style={h > 0 && h < 24 ? { left: `${(h / 24) * 100}%` } : undefined}
              >
                {String(h).padStart(2, "0")}h
              </span>
            ))}
          </div>
          <span />
        </div>
        <ul className="flex flex-col divide-y divide-outline-variant/40 border-y border-outline-variant/40">
          {days.map((day) => {
            const dayName = t(`days.${day.key}`);
            return (
              <li
                key={day.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 py-3.5 md:grid-cols-[168px_minmax(0,1fr)_296px]"
              >
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={day.open}
                    disabled={!canEdit}
                    label={t("openLabel", { day: dayName })}
                    onChange={(next) => mutate(day.key, (d) => ({ ...d, open: next }))}
                  />
                  <span
                    className={clsx(
                      "text-sm font-medium transition-colors",
                      day.open ? "text-on-surface" : "text-on-surface-variant",
                    )}
                  >
                    {dayName}
                  </span>
                </div>

                <div className="hidden md:block">
                  <DayTimeline day={day} />
                </div>

                {day.open ? (
                  <div className="col-span-2 flex flex-col items-start gap-2 md:col-span-1 md:items-end">
                    {day.ranges.map((range, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <TimeSelect
                          value={range.start}
                          disabled={!canEdit}
                          ariaLabel={t("rangeStartAria", { day: dayName, position: i + 1 })}
                          onChange={(v) => setRange(day.key, i, { start: v })}
                        />
                        <span className="text-sm text-on-surface-variant">{t("to")}</span>
                        <TimeSelect
                          value={range.end}
                          disabled={!canEdit}
                          ariaLabel={t("rangeEndAria", { day: dayName, position: i + 1 })}
                          onChange={(v) => setRange(day.key, i, { end: v })}
                        />
                        {canEdit ? (
                          <>
                            <button
                              type="button"
                              aria-label={t("removeRangeAria", { day: dayName, position: i + 1 })}
                              disabled={day.ranges.length < 2}
                              onClick={() => removeRange(day.key, i)}
                              className="flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:invisible md:h-8 md:w-8"
                            >
                              <XIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label={t("addRangeAria", { day: dayName })}
                              title={t("addRange")}
                              disabled={i !== day.ranges.length - 1}
                              onClick={() => addRange(day.key)}
                              className="flex h-10 w-10 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary-fixed disabled:invisible md:h-8 md:w-8"
                            >
                              <PlusIcon className="h-4 w-4" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="justify-self-end text-sm text-outline md:pr-[80px]">{t("closed")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p
            role={error ? "alert" : "status"}
            className={clsx(
              "mr-auto text-sm",
              error ? "text-error" : savedOk ? "text-success-500" : "text-on-surface-variant",
            )}
          >
            {error ?? (savedOk ? t("saved") : dirty ? t("unsaved") : "")}
          </p>
          <Button type="button" onClick={save} isLoading={saving} disabled={!dirty && !error}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      ) : null}
    </SettingsBlock>
  );
}
