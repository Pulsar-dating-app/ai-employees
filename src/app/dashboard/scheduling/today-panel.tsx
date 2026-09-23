"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { ClockIcon } from "@/components/ui/icons";
import type { Appointment } from "./appointment-types";
import { clock, dayHeading, hourLabel, minutesOfDay, relativeFromNow } from "./agenda-format";
import { STATUS_TONE } from "./agenda-row";

export type SchedulingTeamMember = { name: string; photoSrc: string | null; isActive: boolean };

const MINUTE = 60_000;

function subscribeMinute(onChange: () => void) {
  const id = setInterval(onChange, MINUTE / 2);
  return () => clearInterval(id);
}

function useMinuteClock(): number | null {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / MINUTE) * MINUTE,
    () => null,
  );
}

export function TodayPanel({
  appointments,
  timezone,
  today,
  hours,
  hoursConfigured,
  teamMember,
}: {
  appointments: Appointment[];
  timezone: string;
  today: string;
  hours: { start: number; end: number } | null;
  hoursConfigured: boolean;
  teamMember: SchedulingTeamMember | null;
}) {
  const t = useTranslations("Scheduling.appointments");
  const locale = useLocale();
  const now = useMinuteClock();

  const live = appointments.filter((a) => a.status !== "cancelled");
  const completed = live.filter((a) => a.status === "completed").length;
  const heading = dayHeading(today, today, locale, { today: t("board.today"), tomorrow: t("board.tomorrow") });

  const pending = live.filter((a) => a.status === "confirmed" || a.status === "requested");
  const current =
    now !== null
      ? pending.find((a) => new Date(a.starts_at).getTime() <= now && new Date(a.ends_at).getTime() > now)
      : undefined;
  const upcoming = now !== null ? pending.find((a) => new Date(a.starts_at).getTime() > now) : pending[0];
  const focus = current ?? upcoming;

  const starts = live.map((a) => minutesOfDay(new Date(a.starts_at), timezone));
  const ends = live.map((a) => minutesOfDay(new Date(a.ends_at), timezone) || 24 * 60);
  const showTimeline = hours !== null || live.length > 0;
  const rangeStart = Math.floor(Math.min(hours?.start ?? 24 * 60, ...starts) / 60) * 60;
  const rangeEnd = Math.min(24 * 60, Math.ceil(Math.max(hours?.end ?? 0, ...ends) / 60) * 60);
  const span = Math.max(60, rangeEnd - rangeStart);
  const step = span > 12 * 60 ? 120 : 60;
  const ticks: number[] = [];
  for (let m = rangeStart; m <= rangeEnd; m += step) ticks.push(m);
  const nowMinutes = now !== null ? minutesOfDay(new Date(now), timezone) : null;
  const nowPct =
    nowMinutes !== null && nowMinutes >= rangeStart && nowMinutes <= rangeEnd
      ? ((nowMinutes - rangeStart) / span) * 100
      : null;

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-outline-variant/60 bg-surface-container-lowest shadow-[0_1px_2px_rgba(25,28,29,0.04),0_24px_60px_-30px_rgba(53,37,205,0.25)]">
      <div className="flex flex-col gap-6 p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-on-surface">
              {heading.primary}
            </h2>
            <p className="mt-0.5 text-sm text-on-surface-variant">
              <span className="block first-letter:uppercase sm:inline">{heading.secondary}</span>
              <span className="mx-2 hidden text-outline-variant sm:inline">·</span>
              <span className="whitespace-nowrap">{t("board.todayCount", { count: live.length })}</span>
              {completed > 0 ? (
                <>
                  <span className="mx-2 text-outline-variant">·</span>
                  <span className="whitespace-nowrap">{t("board.completedCount", { count: completed })}</span>
                </>
              ) : null}
            </p>
          </div>
          {teamMember ? (
            <div className="inline-flex items-center gap-2.5 self-start rounded-full bg-surface-container py-1 pl-1 pr-3.5">
              <span className="relative h-8 w-8 overflow-hidden rounded-full bg-primary-fixed">
                {teamMember.photoSrc ? (
                  <Image
                    src={teamMember.photoSrc}
                    alt={teamMember.name}
                    fill
                    sizes="32px"
                    className="object-cover object-top"
                  />
                ) : null}
              </span>
              <span
                aria-hidden="true"
                className={clsx(
                  "h-2 w-2 rounded-full",
                  !teamMember.isActive
                    ? "bg-outline"
                    : hoursConfigured
                      ? "inbox-live-dot bg-success-500"
                      : "bg-[#e0902f]",
                )}
              />
              <span className="text-[13px] font-semibold text-on-surface">
                {!teamMember.isActive
                  ? t("board.teamPaused", { name: teamMember.name })
                  : hoursConfigured
                    ? t("board.teamTaking", { name: teamMember.name })
                    : t("board.teamNoHours", { name: teamMember.name })}
              </span>
            </div>
          ) : null}
        </div>

        {focus ? (
          <div
            className={clsx(
              "flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:gap-5",
              current ? "bg-primary text-on-primary" : "bg-primary-fixed/50",
            )}
          >
            <span className={clsx("text-[13px] font-semibold", current ? "text-on-primary/80" : "text-primary")}>
              {current ? t("board.now") : t("board.next")}
            </span>
            <span
              className={clsx(
                "text-[36px] font-semibold leading-none tracking-[-0.02em] tabular-nums",
                current ? "text-on-primary" : "text-on-surface",
              )}
            >
              {clock(new Date(focus.starts_at), timezone, locale)}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={clsx(
                  "block truncate text-[15px] font-semibold",
                  current ? "text-on-primary" : "text-on-surface",
                )}
              >
                {focus.customers?.name ?? t("list.unnamedCustomer")}
              </span>
              <span
                className={clsx(
                  "block truncate text-[13px]",
                  current ? "text-on-primary/80" : "text-on-surface-variant",
                )}
              >
                {focus.services?.name ?? t("list.serviceRemoved")}
                {focus.status === "requested" ? ` · ${t("status.requested")}` : ""}
              </span>
            </span>
            {!current && now !== null ? (
              <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-surface-container-lowest px-3 py-1 text-[12px] font-semibold text-primary sm:self-auto">
                <ClockIcon className="h-3.5 w-3.5" />
                {relativeFromNow(new Date(focus.starts_at), locale, now)}
              </span>
            ) : null}
          </div>
        ) : live.length > 0 ? (
          <p className="rounded-2xl bg-surface-container-low px-4 py-3.5 text-sm text-on-surface-variant">
            {t("board.noneLeft")}
          </p>
        ) : null}

        {showTimeline ? (
          <div role="img" aria-label={t("board.timelineLabel")} className="flex flex-col gap-2">
            <div className="relative h-12 overflow-hidden rounded-xl bg-surface-container-low">
              {ticks.map((m) => (
                <span
                  key={m}
                  aria-hidden="true"
                  className="absolute inset-y-0 w-px bg-outline-variant/50"
                  style={{ left: `${((m - rangeStart) / span) * 100}%` }}
                />
              ))}
              {live.map((a) => {
                const s = minutesOfDay(new Date(a.starts_at), timezone);
                const e = minutesOfDay(new Date(a.ends_at), timezone) || 24 * 60;
                const left = ((s - rangeStart) / span) * 100;
                const width = Math.max(1.5, ((e - s) / span) * 100);
                return (
                  <span
                    key={a.id}
                    title={`${clock(new Date(a.starts_at), timezone, locale)} · ${a.customers?.name ?? t("list.unnamedCustomer")} · ${t(`status.${a.status}`)}`}
                    className={clsx(
                      "billing-bar-in absolute inset-y-1.5 z-20 flex origin-left items-center overflow-hidden rounded-lg px-2 text-[11px] font-semibold ring-1 ring-inset",
                      STATUS_TONE[a.status].block,
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    <span className="truncate max-sm:hidden">{(a.customers?.name ?? "").split(" ")[0]}</span>
                  </span>
                );
              })}
              {nowPct !== null ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 z-10 w-0.5 bg-error"
                  style={{ left: `${nowPct}%` }}
                >
                  <span className="absolute -left-[3px] -top-0.5 h-2 w-2 rounded-full bg-error" />
                </span>
              ) : null}
            </div>
            <div className="relative h-4">
              {ticks.map((m, i) => (
                <span
                  key={m}
                  className={clsx(
                    "absolute whitespace-nowrap text-[11px] tabular-nums text-outline",
                    i !== ticks.length - 1 && (i % 2 === 1 || i === ticks.length - 2) && "max-sm:hidden",
                    i === 0 ? "translate-x-0" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                  )}
                  style={{ left: `${((m - rangeStart) / span) * 100}%` }}
                >
                  {hourLabel(m, locale)}
                </span>
              ))}
            </div>
          </div>
        ) : !hoursConfigured ? (
          <p className="text-sm text-on-surface-variant">{t("board.noHoursTimeline")}</p>
        ) : null}
      </div>
    </section>
  );
}
