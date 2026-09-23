"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ListIcon } from "@/components/ui/icons";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { zonedTimeToUtc } from "@/lib/availability/engine";
import { AgendaRow } from "./agenda-row";
import { AppointmentCalendar } from "./appointment-calendar";
import { APPOINTMENT_STATUSES, type Appointment, type AppointmentStatus } from "./appointment-types";
import { dayHeading, localDateOf } from "./agenda-format";
import { PendingApprovals } from "./pending-approvals";
import { TodayPanel, type SchedulingTeamMember } from "./today-panel";

type Scope = "upcoming" | "past";
type View = "list" | "calendar";

const CALENDAR_PAGE_SIZE = 100;
const CALENDAR_MAX_PAGES = 5;

function monthWindow(month: string, timezone: string): { from: string; to: string } {
  const [year, monthIndex] = month.split("-").map(Number);
  const nextMonth = monthIndex === 12 ? `${year + 1}-01` : `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const start = zonedTimeToUtc(`${month}-01`, "00:00", timezone);
  const end = zonedTimeToUtc(`${nextMonth}-01`, "00:00", timezone);
  return { from: start.toISOString(), to: new Date(end.getTime() - 1).toISOString() };
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  const { indicatorRef, register } = useSlidingIndicator<HTMLButtonElement>(value, options.length, "x");
  return (
    <div role="group" aria-label={label} className="relative inline-flex rounded-full bg-surface-container p-1">
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className="inbox-indicator absolute left-0 rounded-full bg-surface-container-lowest opacity-0 shadow-[0_1px_3px_rgba(25,28,29,0.14)]"
      />
      {options.map((option) => (
        <button
          key={option.value}
          ref={register(option.value)}
          type="button"
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={clsx(
            "relative z-10 inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-label-md font-semibold transition-colors duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed",
            value === option.value ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AppointmentsManager({
  companyId,
  timezone,
  today,
  canEdit,
  initialAppointments,
  initialTotal,
  pageSize,
  todayAppointments,
  pendingAppointments,
  pendingTotal,
  hours,
  hoursConfigured,
  dayStart,
  teamMember,
}: {
  companyId: string;
  timezone: string;
  today: string;
  canEdit: boolean;
  initialAppointments: Appointment[];
  initialTotal: number;
  pageSize: number;
  todayAppointments: Appointment[];
  pendingAppointments: Appointment[];
  pendingTotal: number;
  hours: { start: number; end: number } | null;
  hoursConfigured: boolean;
  dayStart: string;
  teamMember: SchedulingTeamMember | null;
}) {
  const t = useTranslations("Scheduling.appointments");
  const locale = useLocale();
  const router = useRouter();

  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [total, setTotal] = useState(initialTotal);
  const [scope, setScope] = useState<Scope>("upcoming");
  const [status, setStatus] = useState<"" | AppointmentStatus>("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [view, setView] = useState<View>("list");
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [monthAppointments, setMonthAppointments] = useState<Appointment[]>([]);

  async function fetchPage(next: { scope: Scope; status: "" | AppointmentStatus; page: number }) {
    const params = new URLSearchParams();
    if (next.scope === "upcoming") {
      params.set("from", dayStart);
    } else {
      params.set("to", new Date(new Date(dayStart).getTime() - 1).toISOString());
      params.set("order", "desc");
    }
    if (next.status) params.set("status", next.status);
    params.set("page", String(next.page));
    params.set("pageSize", String(pageSize));
    const res = await fetch(`/api/companies/${companyId}/appointments?${params.toString()}`).catch(() => null);
    if (!res?.ok) return null;
    return (await res.json()) as { appointments: Appointment[]; total: number };
  }

  async function reload(next: { scope: Scope; status: "" | AppointmentStatus }) {
    setIsLoading(true);
    const pages = Math.max(1, page);
    const collected: Appointment[] = [];
    let latestTotal = 0;
    for (let p = 1; p <= pages; p++) {
      const json = await fetchPage({ ...next, page: p });
      if (!json) break;
      collected.push(...(json.appointments ?? []));
      latestTotal = json.total ?? 0;
      if (collected.length >= latestTotal) break;
    }
    setAppointments(collected);
    setTotal(latestTotal);
    setIsLoading(false);
  }

  async function refetchMonth(next: { month: string; status: "" | AppointmentStatus }) {
    setIsLoading(true);
    const { from, to } = monthWindow(next.month, timezone);
    const collected: Appointment[] = [];
    for (let pageIndex = 1; pageIndex <= CALENDAR_MAX_PAGES; pageIndex++) {
      const params = new URLSearchParams({ from, to, page: String(pageIndex), pageSize: String(CALENDAR_PAGE_SIZE) });
      if (next.status) params.set("status", next.status);
      const res = await fetch(`/api/companies/${companyId}/appointments?${params.toString()}`).catch(() => null);
      if (!res?.ok) break;
      const json = await res.json();
      collected.push(...((json.appointments ?? []) as Appointment[]));
      if (collected.length >= (json.total ?? 0)) break;
    }
    setMonthAppointments(collected);
    setIsLoading(false);
  }

  function changeView(nextView: View) {
    setView(nextView);
    if (nextView === "calendar") refetchMonth({ month, status });
  }

  function changeMonth(delta: number) {
    const nextMonth = shiftMonth(month, delta);
    setMonth(nextMonth);
    refetchMonth({ month: nextMonth, status });
  }

  async function changeScope(nextScope: Scope) {
    setScope(nextScope);
    setPage(1);
    setIsLoading(true);
    const json = await fetchPage({ scope: nextScope, status, page: 1 });
    if (json) {
      setAppointments(json.appointments ?? []);
      setTotal(json.total ?? 0);
    }
    setIsLoading(false);
  }

  async function changeStatus(nextStatus: "" | AppointmentStatus) {
    setStatus(nextStatus);
    setPage(1);
    if (view === "calendar") {
      refetchMonth({ month, status: nextStatus });
      return;
    }
    setIsLoading(true);
    const json = await fetchPage({ scope, status: nextStatus, page: 1 });
    if (json) {
      setAppointments(json.appointments ?? []);
      setTotal(json.total ?? 0);
    }
    setIsLoading(false);
  }

  async function loadMore() {
    const nextPage = page + 1;
    setIsLoadingMore(true);
    const json = await fetchPage({ scope, status, page: nextPage });
    if (json) {
      setAppointments((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...(json.appointments ?? []).filter((a) => !seen.has(a.id))];
      });
      setTotal(json.total ?? 0);
      setPage(nextPage);
    }
    setIsLoadingMore(false);
  }

  function handlePatched() {
    if (view === "calendar") refetchMonth({ month, status });
    else reload({ scope, status });
    router.refresh();
  }

  const groups: { date: string; items: Appointment[] }[] = [];
  for (const appointment of appointments) {
    const date = localDateOf(new Date(appointment.starts_at), timezone);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.items.push(appointment);
    else groups.push({ date, items: [appointment] });
  }

  const monthLabel = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(`${month}-01T12:00:00Z`),
  );

  return (
    <div className="flex flex-col gap-6">
      <TodayPanel
        appointments={todayAppointments}
        timezone={timezone}
        today={today}
        hours={hours}
        hoursConfigured={hoursConfigured}
        teamMember={teamMember}
      />

      <PendingApprovals
        companyId={companyId}
        timezone={timezone}
        today={today}
        appointments={pendingAppointments}
        total={pendingTotal}
        canEdit={canEdit}
        onPatched={handlePatched}
      />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-headline-md font-semibold tracking-tight text-on-surface">{t("board.agendaTitle")}</h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <Segmented
              value={view}
              label={t("board.viewLabel")}
              onChange={changeView}
              options={[
                { value: "list", label: t("board.list"), icon: <ListIcon className="h-4 w-4" /> },
                { value: "calendar", label: t("board.calendar"), icon: <CalendarIcon className="h-4 w-4" /> },
              ]}
            />
            {view === "list" ? (
              <Segmented
                value={scope}
                label={t("scopeLabel")}
                disabled={isLoading}
                onChange={changeScope}
                options={[
                  { value: "upcoming", label: t("scope.upcoming") },
                  { value: "past", label: t("scope.past") },
                ]}
              />
            ) : (
              <div className="inline-flex items-center rounded-full bg-surface-container p-1">
                <button
                  type="button"
                  aria-label={t("previousMonth")}
                  disabled={isLoading}
                  onClick={() => changeMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-lowest hover:text-on-surface disabled:cursor-not-allowed"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <span className="min-w-[9.5rem] px-2 text-center text-label-md font-semibold text-on-surface first-letter:uppercase">
                  {monthLabel}
                </span>
                <button
                  type="button"
                  aria-label={t("nextMonth")}
                  disabled={isLoading}
                  onClick={() => changeMonth(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-lowest hover:text-on-surface disabled:cursor-not-allowed"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            <span className="relative inline-flex">
              <select
                aria-label={t("statusFilterLabel")}
                value={status}
                disabled={isLoading}
                onChange={(e) => changeStatus(e.target.value as "" | AppointmentStatus)}
                className="h-10 appearance-none rounded-full border-0 bg-surface-container pl-4 pr-10 text-label-md font-semibold text-on-surface outline-none transition-shadow focus:shadow-[0_0_0_4px_rgba(53,37,205,0.12)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">{t("statusFilterAll")}</option>
                {APPOINTMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
              <ChevronRightIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-on-surface-variant" />
            </span>
          </div>
        </div>

        {!canEdit ? (
          <p className="rounded-2xl bg-surface-container px-4 py-3 text-sm text-on-surface-variant">
            {t("readOnlyBanner")}
          </p>
        ) : null}

        <div className="relative h-0.5 overflow-hidden rounded-full">
          {isLoading ? (
            <div className="animate-progress-sweep absolute inset-y-0 w-1/4 rounded-full bg-primary/60" />
          ) : null}
        </div>

        {view === "calendar" ? (
          <AppointmentCalendar
            appointments={monthAppointments}
            timezone={timezone}
            today={today}
            month={month}
            isLoading={isLoading}
          />
        ) : appointments.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-outline-variant px-6 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
              <CalendarIcon className="h-5 w-5" />
            </span>
            <p className="mt-1 text-base font-semibold text-on-surface">{t("emptyState")}</p>
            <p className="max-w-xs text-sm text-on-surface-variant">{t("emptyHint")}</p>
          </div>
        ) : (
          <div className={clsx("flex flex-col gap-4 transition-opacity duration-200", isLoading && "opacity-60")}>
            {groups.map((group, index) => {
              const heading = dayHeading(group.date, today, locale, {
                today: t("board.today"),
                tomorrow: t("board.tomorrow"),
              });
              return (
                <div
                  key={group.date}
                  className="billing-card-in rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest p-2 shadow-[0_1px_2px_rgba(25,28,29,0.04)] sm:p-3"
                  style={{ "--i": Math.min(index, 6) } as React.CSSProperties}
                >
                  <h3 className="flex items-baseline gap-2 px-3 pb-1 pt-2 sm:px-4">
                    <span className="text-[15px] font-semibold text-on-surface first-letter:uppercase">
                      {heading.primary}
                    </span>
                    <span className="text-[13px] text-on-surface-variant">{heading.secondary}</span>
                    <span className="ml-auto text-[12px] tabular-nums text-outline">{group.items.length}</span>
                  </h3>
                  <ul className="flex flex-col">
                    {group.items.map((appointment) => (
                      <AgendaRow
                        key={appointment.id}
                        companyId={companyId}
                        timezone={timezone}
                        canEdit={canEdit}
                        appointment={appointment}
                        isPast={scope === "past"}
                        onPatched={handlePatched}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
            {appointments.length < total ? (
              <button
                type="button"
                disabled={isLoadingMore}
                onClick={loadMore}
                className="h-11 self-center rounded-full px-6 text-label-md font-semibold text-primary transition-colors hover:bg-primary-fixed/50 disabled:opacity-60"
              >
                {isLoadingMore ? <span className="onboarding-loader align-middle" /> : t("board.loadMore")}
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
