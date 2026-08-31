"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { CHEVRON } from "@/components/ui/select";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ListIcon } from "@/components/ui/icons";
import { zonedTimeToUtc } from "@/lib/availability/engine";
import { AppointmentList } from "./appointment-list";
import { AppointmentCalendar } from "./appointment-calendar";
import { APPOINTMENT_STATUSES, type Appointment, type AppointmentStatus } from "./appointment-types";

type Scope = "upcoming" | "past";
type View = "list" | "calendar";

type AppointmentsManagerProps = {
  companyId: string;
  timezone: string;
  /** Company-local "today", as YYYY-MM-DD — the calendar's month cursor and
   * its today-highlight both start from the business's day, not the
   * viewer's. */
  today: string;
  canEdit: boolean;
  initialAppointments: Appointment[];
  initialTotal: number;
  pageSize: number;
  /** The Server-Component summary rail, rendered into the mock's right-hand
   * column. Passed down rather than rendered by the page so the header's
   * controls — client state — can sit where the design puts them, above the
   * whole 12-column grid. */
  summary: ReactNode;
};

// The list endpoint's own ceiling (MAX_PAGE_SIZE in H3's route). A month
// view has no pagination to fall back on, so it pages until it has the whole
// month — capped, so a pathological company can't spin here forever.
const CALENDAR_PAGE_SIZE = 100;
const CALENDAR_MAX_PAGES = 5;

// The UTC instants bounding a company-local month. Same DST-aware helper the
// server uses for its today-counters — the month a booking belongs to is a
// fact about the business's calendar, not the viewer's.
function monthWindow(month: string, timezone: string): { from: string; to: string } {
  const [year, monthIndex] = month.split("-").map(Number);
  const nextMonth =
    monthIndex === 12
      ? `${year + 1}-01`
      : `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const start = zonedTimeToUtc(`${month}-01`, "00:00", timezone);
  const end = zonedTimeToUtc(`${nextMonth}-01`, "00:00", timezone);
  // The route filters `to` with `lte`, so step back a millisecond rather
  // than pulling in a booking that starts exactly at next month's midnight.
  return { from: start.toISOString(), to: new Date(end.getTime() - 1).toISOString() };
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function AppointmentsManager({
  companyId,
  timezone,
  today,
  canEdit,
  initialAppointments,
  initialTotal,
  pageSize,
  summary,
}: AppointmentsManagerProps) {
  const t = useTranslations("Scheduling.appointments");
  const locale = useLocale();
  const router = useRouter();

  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [total, setTotal] = useState(initialTotal);
  const [scope, setScope] = useState<Scope>("upcoming");
  const [status, setStatus] = useState<"" | AppointmentStatus>("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const [view, setView] = useState<View>("list");
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [monthAppointments, setMonthAppointments] = useState<Appointment[]>([]);

  async function refetch(next: { scope: Scope; status: "" | AppointmentStatus; page: number }) {
    setIsLoading(true);
    const params = new URLSearchParams();
    // "Upcoming" and "past" are the same endpoint with the starts_at window
    // flipped — and past reads latest-first, which is why K4 taught the
    // route an `order` param.
    const nowIso = new Date().toISOString();
    if (next.scope === "upcoming") {
      params.set("from", nowIso);
    } else {
      params.set("to", nowIso);
      params.set("order", "desc");
    }
    if (next.status) params.set("status", next.status);
    params.set("page", String(next.page));
    params.set("pageSize", String(pageSize));

    const res = await fetch(`/api/companies/${companyId}/appointments?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setAppointments(json.appointments ?? []);
      setTotal(json.total ?? 0);
    }
    setIsLoading(false);
  }

  // The calendar wants a whole month at once, not a page of it — the same
  // endpoint, windowed by the month instead of by now.
  async function refetchMonth(next: { month: string; status: "" | AppointmentStatus }) {
    setIsLoading(true);
    const { from, to } = monthWindow(next.month, timezone);
    const collected: Appointment[] = [];

    for (let pageIndex = 1; pageIndex <= CALENDAR_MAX_PAGES; pageIndex++) {
      const params = new URLSearchParams({
        from,
        to,
        page: String(pageIndex),
        pageSize: String(CALENDAR_PAGE_SIZE),
      });
      if (next.status) params.set("status", next.status);

      const res = await fetch(`/api/companies/${companyId}/appointments?${params.toString()}`);
      if (!res.ok) break;
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

  function changeScope(nextScope: Scope) {
    setScope(nextScope);
    setPage(1);
    refetch({ scope: nextScope, status, page: 1 });
  }

  function changeStatus(nextStatus: "" | AppointmentStatus) {
    setStatus(nextStatus);
    setPage(1);
    if (view === "calendar") refetchMonth({ month, status: nextStatus });
    else refetch({ scope, status: nextStatus, page: 1 });
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    refetch({ scope, status, page: nextPage });
  }

  // A status change can move a row out of the current filter, so re-fetch
  // rather than patching in place — otherwise "show only confirmed" keeps
  // displaying the one you just cancelled. router.refresh() re-runs the
  // Server Component alongside it, so the summary rail's counts move with
  // the list instead of going stale.
  function handlePatched() {
    refetch({ scope, status, page });
    router.refresh();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const monthLabel = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00Z`));

  return (
    <div>
      {/* Page header, per the Stitch screen: title + subtitle left, controls
          right. No icon tile — that screen doesn't draw one. */}
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          {/* Weight and tracking come from the type token itself (globals.css
              carries the Stitch scale), so no font-/tracking- utility here. */}
          <h1 className="text-headline-lg text-on-surface">{t("pageTitle")}</h1>
          <p className="mt-1 text-body-md text-on-surface-variant">{t("pageSubtitle")}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Not in the mock, which has no status filter at all — but K4
              ships one, so it takes that screen's control chrome (h-10,
              rounded-lg, hairline border) rather than this app's taller
              form-field chrome. */}
          <select
            aria-label={t("statusFilterLabel")}
            value={status}
            disabled={isLoading}
            onChange={(e) => changeStatus(e.target.value as "" | AppointmentStatus)}
            className={clsx(
              "h-10 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 text-label-md text-on-surface shadow-level1 outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60",
              CHEVRON,
            )}
          >
            <option value="">{t("statusFilterAll")}</option>
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>

          {view === "list" ? (
            <div
              role="group"
              aria-label={t("scopeLabel")}
              className={clsx(
                "inline-flex rounded-lg border border-outline-variant/30 bg-surface-container-low p-1 shadow-level1 transition-opacity",
                isLoading && "opacity-70",
              )}
            >
              {(["upcoming", "past"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scope === value}
                  disabled={isLoading}
                  onClick={() => changeScope(value)}
                  className={clsx(
                    "rounded px-4 py-2 text-label-md transition-all disabled:cursor-not-allowed",
                    scope === value
                      ? "bg-surface font-bold text-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  {t(`scope.${value}`)}
                </button>
              ))}
            </div>
          ) : (
            // The month cursor takes the segmented control's slot: "upcoming
            // vs past" has no meaning once you're looking at a month grid.
            <div
              className={clsx(
                "inline-flex items-center rounded-lg border border-outline-variant/30 bg-surface-container-low p-1 shadow-level1 transition-opacity",
                isLoading && "opacity-70",
              )}
            >
              <button
                type="button"
                aria-label={t("previousMonth")}
                disabled={isLoading}
                onClick={() => changeMonth(-1)}
                className="flex h-8 w-8 items-center justify-center rounded text-on-surface-variant transition-colors hover:text-on-surface disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="min-w-[9.5rem] px-2 text-center text-label-md font-bold text-on-surface first-letter:uppercase">
                {monthLabel}
              </span>
              <button
                type="button"
                aria-label={t("nextMonth")}
                disabled={isLoading}
                onClick={() => changeMonth(1)}
                className="flex h-8 w-8 items-center justify-center rounded text-on-surface-variant transition-colors hover:text-on-surface disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* The mock's square button, and what it's for: it swaps the list
              for a month grid. Its icon is the view you'd get by pressing
              it, so it never sits next to a grid showing a calendar. */}
          <button
            type="button"
            aria-pressed={view === "calendar"}
            title={view === "list" ? t("calendarView") : t("listView")}
            aria-label={view === "list" ? t("calendarView") : t("listView")}
            onClick={() => changeView(view === "list" ? "calendar" : "list")}
            className={clsx(
              "card-hover flex h-10 w-10 items-center justify-center rounded-lg border shadow-level1 transition-all",
              view === "calendar"
                ? "border-primary/50 bg-primary-fixed text-primary"
                : "border-outline-variant/50 bg-surface text-on-surface-variant hover:border-primary/50 hover:text-primary",
            )}
          >
            {view === "list" ? (
              <CalendarIcon className="h-5 w-5" />
            ) : (
              <ListIcon className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-8">
          {!canEdit ? (
            <p className="rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3 text-label-md text-on-surface-variant">
              {t("readOnlyBanner")}
            </p>
          ) : null}

          {view === "calendar" ? (
            <AppointmentCalendar
              appointments={monthAppointments}
              timezone={timezone}
              today={today}
              month={month}
              isLoading={isLoading}
            />
          ) : (
            <>
              <AppointmentList
                companyId={companyId}
                timezone={timezone}
                canEdit={canEdit}
                appointments={appointments}
                isLoading={isLoading}
                onPatched={handlePatched}
              />

              {totalPages > 1 ? (
                <div className="flex items-center justify-between">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1 || isLoading}
                    onClick={() => changePage(page - 1)}
                  >
                    {t("previousPage")}
                  </Button>
                  <span className="text-label-md text-on-surface-variant">
                    {t("pageOf", { page, totalPages })}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page * pageSize >= total || isLoading}
                    onClick={() => changePage(page + 1)}
                  >
                    {t("nextPage")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-col gap-6 lg:col-span-4">{summary}</div>
      </div>
    </div>
  );
}
