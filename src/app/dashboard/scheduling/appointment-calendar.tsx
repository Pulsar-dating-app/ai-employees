"use client";

import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import type { Appointment } from "./appointment-types";
import { clock, localDateOf } from "./agenda-format";
import { STATUS_TONE } from "./agenda-row";
import { professionalNameOf, useShowProfessional } from "./professional-label";

function buildGrid(month: string): { date: string; inMonth: boolean }[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const cursor = new Date(first);
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());
  const cells: { date: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push({ date: cursor.toISOString().slice(0, 10), inMonth: cursor.getUTCMonth() === monthIndex - 1 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  while (cells.length > 35 && !cells.slice(35).some((cell) => cell.inMonth)) cells.length = 35;
  return cells;
}

export function AppointmentCalendar({
  appointments,
  timezone,
  today,
  month,
  isLoading,
}: {
  appointments: Appointment[];
  timezone: string;
  today: string;
  month: string;
  isLoading: boolean;
}) {
  const t = useTranslations("Scheduling.appointments");
  const locale = useLocale();
  const showProfessional = useShowProfessional();

  const byDate = new Map<string, Appointment[]>();
  for (const appointment of appointments) {
    const key = localDateOf(new Date(appointment.starts_at), timezone);
    const list = byDate.get(key);
    if (list) list.push(appointment);
    else byDate.set(key, [appointment]);
  }
  for (const list of byDate.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const cells = buildGrid(month);
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 7, 30 + i))),
  );

  return (
    <div
      aria-busy={isLoading}
      className={clsx(
        "overflow-hidden rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest shadow-[0_1px_2px_rgba(25,28,29,0.04)] transition-opacity duration-200",
        isLoading && "opacity-60",
      )}
    >
      <div className="grid grid-cols-7 border-b border-outline-variant/50">
        {weekdayNames.map((name) => (
          <div
            key={name}
            className="py-2.5 text-center text-[12px] font-semibold text-on-surface-variant first-letter:uppercase"
          >
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const dayAppointments = byDate.get(cell.date) ?? [];
          const isToday = cell.date === today;
          return (
            <div
              key={cell.date}
              className={clsx(
                "flex min-h-[112px] flex-col gap-1 border-outline-variant/40 p-1.5 sm:p-2",
                i % 7 !== 6 && "border-r",
                i < cells.length - 7 && "border-b",
                cell.inMonth ? "bg-surface-container-lowest" : "bg-surface-container-low/60",
              )}
            >
              <span
                className={clsx(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums",
                  isToday ? "bg-primary text-on-primary" : cell.inMonth ? "text-on-surface" : "text-outline",
                )}
              >
                {Number(cell.date.slice(8))}
              </span>
              <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
                {dayAppointments.map((appointment) => (
                  <span
                    key={appointment.id}
                    title={[
                      appointment.customers?.name ?? t("list.unnamedCustomer"),
                      appointment.services?.name ?? t("list.serviceRemoved"),
                      showProfessional ? professionalNameOf(appointment) : null,
                      t(`status.${appointment.status}`),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    className={clsx(
                      "flex items-center gap-1 truncate rounded-md px-1.5 py-1 text-[11px] font-medium ring-1 ring-inset",
                      STATUS_TONE[appointment.status].block,
                      appointment.status === "cancelled" && "line-through",
                    )}
                  >
                    <span className="shrink-0 font-semibold tabular-nums">
                      {clock(new Date(appointment.starts_at), timezone, locale)}
                    </span>
                    <span className="hidden truncate md:inline">
                      {(appointment.customers?.name ?? t("list.unnamedCustomer")).split(" ")[0]}
                    </span>
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
