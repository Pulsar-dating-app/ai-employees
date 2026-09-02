"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { CalendarIcon, ChevronRightIcon, ClockIcon, XIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { PREDEFINED_INTAKE_FIELDS } from "@/lib/appointments/intake-fields";
import type { Appointment, AppointmentStatus } from "./appointment-types";

// R2 -- intake_answers is keyed by a field's stable slug (`full_name`,
// `cpf`, …). Show the predefined ones with their proper label; for a
// custom key, un-slug it for a readable heading. Bookings made before R2
// were keyed by the raw label, which un-slugging leaves essentially intact.
const PREDEFINED_INTAKE_LABELS: Record<string, string> = Object.fromEntries(
  PREDEFINED_INTAKE_FIELDS.map((f) => [f.key, f.label]),
);
function intakeKeyLabel(key: string): string {
  if (PREDEFINED_INTAKE_LABELS[key]) return PREDEFINED_INTAKE_LABELS[key];
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type AppointmentListProps = {
  companyId: string;
  timezone: string;
  canEdit: boolean;
  appointments: Appointment[];
  isLoading: boolean;
  onPatched: () => void;
};

// Every class below is lifted from the Stitch "Bookings & Appointments
// Dashboard" screen rather than routed through <Card>/<Button>: that screen's
// chrome is lighter than this app's primitives (hairlines at 30% opacity,
// 32px-tall secondary actions, `rounded-lg` on the primary), and the brief
// was to match it exactly. Kept as named constants so the mock's values live
// in one place per element instead of being scattered through the JSX.
const CARD_CLASSES =
  "relative overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-level1 card-hover";
const SECONDARY_ACTION_CLASSES =
  "h-8 rounded-md border border-outline-variant/20 bg-surface-container px-3 text-label-sm font-medium text-on-surface-variant transition-all hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-60";

// Status chip. `confirmed` is the mock's own chip, verbatim; the other four
// are the same shape in the tone each status already carries elsewhere in
// the app.
const STATUS_CHIP: Record<AppointmentStatus, string> = {
  requested: "border border-primary-fixed bg-primary-fixed/60 text-primary",
  confirmed: "border border-secondary-container/30 bg-secondary-container/20 text-tertiary",
  completed: "border border-outline-variant/30 bg-surface-container text-on-surface-variant",
  cancelled: "border border-outline-variant/30 bg-surface-container text-on-surface-variant",
  no_show: "border border-error/20 bg-error-container/40 text-error",
};

// The left edge: `bg-primary` while a booking is still live (the mock's own
// accent), neutral once it's history, error for a no-show.
const STATUS_ACCENT: Record<AppointmentStatus, string> = {
  requested: "bg-primary",
  confirmed: "bg-primary",
  completed: "bg-outline-variant",
  cancelled: "bg-outline-variant",
  no_show: "bg-error",
};

// Only these two are still in play; the rest are terminal.
const ACTIONABLE: AppointmentStatus[] = ["requested", "confirmed"];

export function AppointmentList({
  companyId,
  timezone,
  canEdit,
  appointments,
  isLoading,
  onPatched,
}: AppointmentListProps) {
  const t = useTranslations("Scheduling.appointments");

  if (appointments.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-lowest px-6 py-14 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
          <CalendarIcon className="h-5 w-5" />
        </span>
        <p className="text-body-md font-medium text-on-surface">{t("emptyState")}</p>
        <p className="max-w-xs text-label-md text-on-surface-variant">{t("emptyHint")}</p>
      </div>
    );
  }

  // A scope/status/page change replaces the whole list, so dimming the old
  // rows would leave the merchant reading data that's about to be wrong.
  // Skeletons in the cards' own geometry say "this is being rebuilt" without
  // the list collapsing to nothing and jumping the page.
  if (isLoading) {
    const placeholders = Math.min(Math.max(appointments.length, 3), 5);
    return (
      <ul aria-busy className="flex flex-col gap-4">
        {Array.from({ length: placeholders }, (_, i) => (
          <AppointmentCardSkeleton key={i} />
        ))}
      </ul>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {appointments.map((appointment) => (
        <AppointmentCard
          key={appointment.id}
          companyId={companyId}
          timezone={timezone}
          canEdit={canEdit}
          appointment={appointment}
          onPatched={onPatched}
        />
      ))}
    </ul>
  );
}

// The booking card's silhouette: accent bar, date tile, three text lines and
// the action stack, so the real cards land in place instead of shifting
// everything when they arrive.
function AppointmentCardSkeleton() {
  return (
    <li className={clsx(CARD_CLASSES, "pointer-events-none")}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-outline-variant/40" />
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <div className="flex gap-4">
          <Skeleton className="hidden h-[62px] w-[70px] rounded-lg sm:block" />
          <div className="flex flex-col gap-2 py-0.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="flex items-end justify-between gap-2 sm:flex-col sm:justify-start">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      </div>
    </li>
  );
}

function AppointmentCard({
  companyId,
  timezone,
  canEdit,
  appointment,
  onPatched,
}: {
  companyId: string;
  timezone: string;
  canEdit: boolean;
  appointment: Appointment;
  onPatched: () => void;
}) {
  const t = useTranslations("Scheduling.appointments");
  const locale = useLocale();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [showIntake, setShowIntake] = useState(false);

  // Trello K9 — the pre-booking questions Ana actually got an answer for.
  // Blank / missing values are dropped, so a row with none configured (or an
  // older booking) shows nothing at all rather than an empty disclosure.
  const intakeEntries = Object.entries(appointment.intake_answers ?? {}).filter(
    ([, value]) => typeof value === "string" && value.trim() !== "",
  );

  // Formatted in the *company's* timezone, not the viewer's — a booking is
  // an event at the business, and a merchant travelling shouldn't see their
  // day shift. Passing an explicit timeZone also keeps server and client
  // output identical, so this doesn't hydrate-mismatch.
  const start = new Date(appointment.starts_at);
  const end = new Date(appointment.ends_at);
  const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options }).format(date);

  const monthLabel = format(start, { month: "short" });
  const dayLabel = format(start, { day: "numeric" });
  const timeLabel = `${format(start, { hour: "2-digit", minute: "2-digit" })} - ${format(end, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  // `extra` carries the decline path's cancellation_reason — a decline is a
  // `cancelled` status with a reason recorded (K7), not a status of its own.
  async function setStatus(status: AppointmentStatus, extra?: Record<string, unknown>) {
    setIsWorking(true);
    const res = await fetch(`/api/companies/${companyId}/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    setIsWorking(false);
    setConfirmingCancel(false);
    setConfirmingDecline(false);
    if (res.ok) onPatched();
  }

  const isTerminal = !ACTIONABLE.includes(appointment.status);

  return (
    <li className={clsx(CARD_CLASSES, isTerminal && "opacity-75")}>
      <span
        aria-hidden
        className={clsx("absolute inset-y-0 left-0 w-1", STATUS_ACCENT[appointment.status])}
      />

      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <div className="flex gap-4">
          {/* Date tile: tinted while the booking is live, neutral once it's
              history — the mock draws both variants. */}
          <div
            className={clsx(
              "hidden min-w-[70px] flex-col items-center justify-center rounded-lg p-3 text-center sm:flex",
              isTerminal
                ? "border border-outline-variant/20 bg-surface-container"
                : "bg-primary-fixed/20",
            )}
          >
            <span
              className={clsx(
                "text-label-sm font-bold uppercase tracking-wider",
                // The mock puts `primary-fixed-dim` (#c3c0ff) on a near-white
                // tile, which is ~1.6:1 — illegible. Same faint-indigo read,
                // at a contrast a merchant can actually use.
                isTerminal ? "text-on-surface-variant" : "text-primary/70",
              )}
            >
              {monthLabel}
            </span>
            <span
              className={clsx(
                "mt-1 text-headline-md font-bold leading-none",
                isTerminal ? "text-on-surface" : "text-primary",
              )}
            >
              {dayLabel}
            </span>
          </div>

          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-body-lg font-semibold text-on-surface">
                {appointment.customers?.name ?? t("list.unnamedCustomer")}
              </h3>
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-label-sm font-semibold",
                  STATUS_CHIP[appointment.status],
                )}
              >
                {t(`status.${appointment.status}`)}
              </span>
            </div>

            <div className="mb-2 flex items-center gap-2 text-label-md text-on-surface-variant">
              <ClockIcon className="h-4 w-4 shrink-0" />
              <span className="tabular-nums">{timeLabel}</span>
            </div>

            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
                <CalendarIcon className="h-3.5 w-3.5" />
              </span>
              <span className="text-label-md">
                <span className="font-semibold text-on-surface">{t("list.serviceLabel")}</span>{" "}
                {appointment.services?.name ?? t("list.serviceRemoved")}
                {appointment.customers?.phone ? (
                  <span className="tabular-nums"> · {appointment.customers.phone}</span>
                ) : null}
              </span>
            </div>

            {intakeEntries.length > 0 ? (
              <div className="mt-2">
                <button
                  type="button"
                  aria-expanded={showIntake}
                  onClick={() => setShowIntake((v) => !v)}
                  className="flex items-center gap-1 text-label-md font-medium text-on-surface-variant transition-colors hover:text-on-surface"
                >
                  <ChevronRightIcon
                    className={clsx("h-4 w-4 transition-transform", showIntake && "rotate-90")}
                  />
                  {t("list.intakeToggle", { count: intakeEntries.length })}
                </button>
                {showIntake ? (
                  <dl className="mt-2 flex flex-col gap-1.5 border-l-2 border-outline-variant/40 pl-3">
                    {intakeEntries.map(([key, value]) => (
                      <div key={key} className="flex flex-wrap gap-x-1.5 text-label-md">
                        <dt className="font-semibold text-on-surface">{intakeKeyLabel(key)}:</dt>
                        <dd className="text-on-surface-variant">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {canEdit && !isTerminal ? (
          <div className="flex items-end justify-between gap-2 border-t border-outline-variant/20 pt-4 sm:flex-col sm:justify-start sm:border-t-0 sm:pt-0">
            {confirmingCancel ? (
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <p className="max-w-[15rem] text-label-md text-on-surface-variant sm:text-right">
                  {t("actions.cancelPrompt")}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => setStatus("cancelled")}
                    className="h-8 rounded-md border border-error/40 bg-error-container/40 px-3 text-label-sm font-semibold text-error transition-all hover:bg-error-container disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t("actions.confirmCancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(false)}
                    className="h-8 px-3 text-label-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface"
                  >
                    {t("actions.keep")}
                  </button>
                </div>
              </div>
            ) : confirmingDecline ? (
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <p className="max-w-[15rem] text-label-md text-on-surface-variant sm:text-right">
                  {t("actions.declinePrompt")}
                </p>
                <input
                  type="text"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder={t("actions.declineReasonPlaceholder")}
                  maxLength={500}
                  className="h-8 w-full rounded-md border border-outline-variant/40 bg-surface-container-lowest px-2 text-label-sm text-on-surface outline-none transition-colors placeholder:text-outline focus:ring-2 focus:ring-primary/40 sm:w-56"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() =>
                      setStatus("cancelled", {
                        cancellation_reason: declineReason.trim() || null,
                      })
                    }
                    className="h-8 rounded-md border border-error/40 bg-error-container/40 px-3 text-label-sm font-semibold text-error transition-all hover:bg-error-container disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t("actions.confirmDecline")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDecline(false);
                      setDeclineReason("");
                    }}
                    className="h-8 px-3 text-label-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface"
                  >
                    {t("actions.keep")}
                  </button>
                </div>
              </div>
            ) : appointment.status === "requested" ? (
              <>
                {/* Approval toggle is on (companies.requires_appointment_approval),
                    so a customer booking lands here as `requested`. Approve
                    flips it to `confirmed` (H3 PATCH; I3 then creates the
                    Google event); Decline records a cancellation_reason (K7). */}
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => setStatus("confirmed")}
                  className="h-9 rounded-lg bg-primary px-4 text-label-sm font-semibold text-on-primary shadow-sm transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("actions.approve")}
                </button>
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => setConfirmingDecline(true)}
                  className={SECONDARY_ACTION_CLASSES}
                >
                  {t("actions.decline")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => setStatus("completed")}
                  className="h-9 rounded-lg bg-primary px-4 text-label-sm font-semibold text-on-primary shadow-sm transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("actions.complete")}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => setStatus("no_show")}
                    className={SECONDARY_ACTION_CLASSES}
                  >
                    {t("actions.noShow")}
                  </button>
                  <button
                    type="button"
                    title={t("actions.cancel")}
                    aria-label={t("actions.cancel")}
                    onClick={() => setConfirmingCancel(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-outline-variant/20 bg-surface-container text-on-surface-variant transition-all hover:bg-error-container hover:text-error"
                  >
                    <XIcon className="h-[18px] w-[18px]" />
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}
