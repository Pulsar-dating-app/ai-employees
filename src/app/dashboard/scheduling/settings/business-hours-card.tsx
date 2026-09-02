"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { ClockIcon, PlusIcon, XIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "./settings-section";
import { Toggle } from "@/components/ui/toggle";

export type BusinessHourRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

// Display order is Monday-first (the Stitch screen's order); the DB's
// day_of_week is 0 = Sunday (I2's documented convention), hence the explicit
// `dow` on each entry rather than the array index.
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

const TIME_INPUT_CLASSES =
  "h-10 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 text-sm text-on-surface outline-none transition-colors focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60";

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

// After one range is edited, push every later range that now starts before
// the previous one ends forward to sit right after it, keeping its own
// length (or a 60-min fallback if it had none). Stops at the first range
// that no longer collides — the rest are already clear. So dragging
// 14:00–15:00 out to 14:00–16:00 slides a following 15:00–16:00 to
// 16:00–17:00, and cascades on if that one now overlaps the next.
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
    // Every active row for the day becomes one editable range — split
    // shifts (a lunch break, an evening block) are two/three rows on the
    // same day, which the schema allows via
    // UNIQUE(company_id, day_of_week, start_time).
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

export function BusinessHoursCard({
  companyId,
  canEdit,
  initialRows,
}: {
  companyId: string;
  canEdit: boolean;
  initialRows: BusinessHourRow[];
}) {
  const t = useTranslations("Scheduling.settings.businessHours");
  const [days, setDays] = useState<DayState[]>(() => buildInitialState(initialRows));
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function mutate(key: string, fn: (day: DayState) => DayState) {
    setDays((prev) => prev.map((d) => (d.key === key ? fn(d) : d)));
    setSavedOk(false);
    setError(null);
  }

  function setRange(key: string, index: number, patch: Partial<TimeRange>) {
    mutate(key, (d) => {
      const current = d.ranges[index];
      let edited = { ...current, ...patch };
      // Moving the start to/past the end carries the end forward by the
      // range's previous length (08:00–12:00 dragged to start 15:00 becomes
      // 15:00–19:00) — the same courtesy addRange and the downstream cascade
      // already do, so a start edit can then collide with (and push) the
      // ranges after it instead of quietly going invalid.
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

  // First problem found, as a ready-to-show message. Covers what the API
  // 400s on (end <= start) and what its UNIQUE(day, start_time) constraint
  // would 500 on (two ranges sharing a start — a subset of "overlap").
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
        .flatMap((d) =>
          d.ranges.map((r) => ({ day_of_week: d.dow, start_time: r.start, end_time: r.end })),
        );
      const res = await fetch(`/api/companies/${companyId}/business-hours`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessHours }),
      });
      if (!res.ok) {
        setError(t("saveError"));
        setSaving(false);
        return;
      }
      setSaving(false);
      setSavedOk(true);
    } catch {
      setError(t("saveError"));
      setSaving(false);
    }
  }

  return (
    <SettingsSection id="business-hours" icon={ClockIcon} title={t("title")} subtitle={t("subtitle")}>
      <div className="flex flex-col gap-4">
        {days.map((day) => {
          const dayName = t(`days.${day.key}`);
          return (
            <div
              key={day.key}
              className={clsx(
                "flex flex-col gap-3 rounded-lg border border-transparent bg-surface-container-low p-4 transition-colors sm:flex-row sm:items-start sm:justify-between",
                day.open ? "hover:border-outline-variant/40" : "bg-surface-container-low/60",
              )}
            >
              <div className="flex items-center gap-4 pt-1 sm:w-40">
                <Toggle
                  checked={day.open}
                  disabled={!canEdit}
                  label={t("openLabel", { day: dayName })}
                  onChange={(next) => mutate(day.key, (d) => ({ ...d, open: next }))}
                />
                <span
                  className={clsx(
                    "text-body-md font-medium",
                    day.open ? "text-on-surface" : "text-on-surface-variant",
                  )}
                >
                  {dayName}
                </span>
              </div>

              {day.open ? (
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  {day.ranges.map((range, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <input
                        type="time"
                        className={TIME_INPUT_CLASSES}
                        value={range.start}
                        disabled={!canEdit}
                        onChange={(e) => setRange(day.key, i, { start: e.target.value })}
                      />
                      <span className="text-on-surface-variant">{t("to")}</span>
                      <input
                        type="time"
                        className={TIME_INPUT_CLASSES}
                        value={range.end}
                        disabled={!canEdit}
                        onChange={(e) => setRange(day.key, i, { end: e.target.value })}
                      />
                      {canEdit && day.ranges.length > 1 ? (
                        <button
                          type="button"
                          aria-label={t("removeRange")}
                          onClick={() => removeRange(day.key, i)}
                          className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => addRange(day.key)}
                      className="inline-flex items-center gap-1 self-start text-label-md font-medium text-primary transition-colors hover:text-primary-container sm:self-end"
                    >
                      <PlusIcon className="h-4 w-4" />
                      {t("addRange")}
                    </button>
                  ) : null}
                </div>
              ) : (
                <span className="rounded-md bg-surface-container px-3 py-1.5 text-label-md font-medium text-on-surface-variant">
                  {t("closed")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {canEdit ? (
        <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-outline-variant/40 pt-4">
          {error ? (
            <p role="alert" className="mr-auto text-sm text-error">
              {error}
            </p>
          ) : savedOk ? (
            <p className="mr-auto text-sm text-tertiary">{t("saved")}</p>
          ) : null}
          <Button type="button" onClick={save} isLoading={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      ) : null}
    </SettingsSection>
  );
}
