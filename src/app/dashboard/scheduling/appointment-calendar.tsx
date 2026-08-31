"use client";

import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import type { Appointment, AppointmentStatus } from "./appointment-types";

// The month grid behind the header's calendar button. Everything here is
// computed in the *company's* timezone, same rule the cards follow: which
// day a booking falls on is a fact about the business, not about where the
// merchant is standing.
//
// Week starts on Sunday, matching this codebase's `day_of_week` 0 = Sunday
// convention (business_hours / availability engine) rather than being
// locale-derived — one convention across the scheduling feature beats two.

type AppointmentCalendarProps = {
  appointments: Appointment[];
  timezone: string;
  /** Company-local "today", as YYYY-MM-DD. */
  today: string;
  /** The month being shown, as YYYY-MM. */
  month: string;
  isLoading: boolean;
};

// Booking chips inside a day cell — the same tones the cards' status chips
// use, flattened to one line each.
const STATUS_CHIP: Record<AppointmentStatus, string> = {
  requested: "bg-primary-fixed/60 text-primary",
  confirmed: "bg-secondary-container/20 text-tertiary",
  completed: "bg-surface-container text-on-surface-variant",
  cancelled: "bg-surface-container text-on-surface-variant line-through",
  no_show: "bg-error-container/40 text-error",
};

function localDateOf(instant: Date, timezone: string): string {
  // en-CA formats as YYYY-MM-DD, which is the shape the rest of this file
  // compares on (same trick analytics/load.ts's localDate uses).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

// Every cell the grid needs: the month's days, padded out to whole weeks.
function buildGrid(month: string): { date: string; inMonth: boolean }[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const cursor = new Date(first);
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());

  const cells: { date: string; inMonth: boolean }[] = [];
  // Six weeks covers every possible month layout; trailing all-blank weeks
  // are dropped below rather than rendered as empty rows.
  for (let i = 0; i < 42; i++) {
    cells.push({
      date: cursor.toISOString().slice(0, 10),
      inMonth: cursor.getUTCMonth() === monthIndex - 1,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  while (cells.length > 35 && !cells.slice(35).some((cell) => cell.inMonth)) {
    cells.length = 35;
  }
  return cells;
}

export function AppointmentCalendar({
  appointments,
  timezone,
  today,
  month,
  isLoading,
}: AppointmentCalendarProps) {
  const t = useTranslations("Scheduling.appointments");
  const locale = useLocale();

  const byDate = new Map<string, Appointment[]>();
  for (const appointment of appointments) {
    const key = localDateOf(new Date(appointment.starts_at), timezone);
    const list = byDate.get(key);
    if (list) list.push(appointment);
    else byDate.set(key, [appointment]);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  const cells = buildGrid(month);

  // A fixed reference week (2026-08-30 is a Sunday) purely to name the
  // columns in the viewer's language.
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 7, 30 + i)),
    ),
  );

  return (
    <div
      aria-busy={isLoading}
      className={clsx(
        "overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-level1 transition-opacity duration-200",
        isLoading && "pointer-events-none opacity-60",
      )}
    >
      <div className="grid grid-cols-7 gap-px">
        {weekdayNames.map((name) => (
          <div
            key={name}
            className="pb-2 text-center text-label-sm font-bold uppercase tracking-wider text-on-surface-variant"
          >
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-outline-variant/30">
        {cells.map((cell) => {
          const dayAppointments = byDate.get(cell.date) ?? [];
          const isToday = cell.date === today;

          return (
            <div
              key={cell.date}
              className={clsx(
                "flex min-h-[104px] flex-col gap-1 p-2",
                cell.inMonth ? "bg-surface-container-lowest" : "bg-surface-container-low",
                isToday && "bg-primary-fixed/20",
              )}
            >
              <span
                className={clsx(
                  "text-label-sm font-bold",
                  isToday
                    ? "text-primary"
                    : cell.inMonth
                      ? "text-on-surface"
                      : "text-on-surface-variant/60",
                )}
              >
                {Number(cell.date.slice(8))}
              </span>

              <div className="flex max-h-24 flex-col gap-1 overflow-y-auto">
                {dayAppointments.map((appointment) => (
                  <span
                    key={appointment.id}
                    title={`${appointment.customers?.name ?? t("list.unnamedCustomer")} · ${
                      appointment.services?.name ?? t("list.serviceRemoved")
                    }`}
                    className={clsx(
                      "truncate rounded px-1.5 py-0.5 text-label-sm font-medium",
                      STATUS_CHIP[appointment.status],
                    )}
                  >
                    <span className="tabular-nums">
                      {new Intl.DateTimeFormat(locale, {
                        timeZone: timezone,
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(appointment.starts_at))}
                    </span>{" "}
                    {appointment.customers?.name ?? t("list.unnamedCustomer")}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
