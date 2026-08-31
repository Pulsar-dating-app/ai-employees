"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import type { Appointment, AppointmentStatus } from "./appointment-types";

type AppointmentListProps = {
  companyId: string;
  timezone: string;
  canEdit: boolean;
  appointments: Appointment[];
  isLoading: boolean;
  onPatched: () => void;
};

// Status → chip styling. `requested` is the one that wants the merchant's
// attention (it's waiting on approval), so it carries the tertiary tone
// rather than the neutral one terminal states get.
const STATUS_TONE: Record<AppointmentStatus, string> = {
  requested: "bg-tertiary-container/50 text-on-tertiary-container",
  confirmed: "bg-secondary-container/40 text-on-secondary-container",
  completed: "bg-surface-container text-on-surface-variant",
  cancelled: "bg-surface-container text-on-surface-variant",
  no_show: "bg-error-container/40 text-on-error-container",
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
    return <p className="py-6 text-sm text-on-surface-variant">{t("emptyState")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-outline-variant text-on-surface-variant">
            <th className="py-2 pr-3 font-medium">{t("list.whenColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.serviceColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.customerColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.statusColumn")}</th>
            {canEdit ? <th className="py-2 pr-3 font-medium">{t("list.actionsColumn")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {appointments.map((appointment) => (
            <AppointmentRow
              key={appointment.id}
              companyId={companyId}
              timezone={timezone}
              canEdit={canEdit}
              appointment={appointment}
              onPatched={onPatched}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AppointmentRow({
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
  const [isWorking, setIsWorking] = useState(false);

  // Formatted in the *company's* timezone, not the viewer's — a booking is
  // an event at the business, and a merchant travelling shouldn't see their
  // day shift. Passing an explicit timeZone also keeps server and client
  // output identical, so this doesn't hydrate-mismatch.
  const start = new Date(appointment.starts_at);
  const end = new Date(appointment.ends_at);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(start);
  const timeLabel = `${new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(start)} – ${new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(end)}`;

  async function setStatus(status: AppointmentStatus) {
    setIsWorking(true);
    const res = await fetch(`/api/companies/${companyId}/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setIsWorking(false);
    setConfirmingCancel(false);
    if (res.ok) onPatched();
  }

  const isTerminal = !ACTIONABLE.includes(appointment.status);

  return (
    <tr className={clsx("border-b border-outline-variant/60", isTerminal && "opacity-60")}>
      <td className="py-2 pr-3">
        <span className="block font-medium text-on-surface">{dateLabel}</span>
        <span className="block text-xs text-on-surface-variant tabular-nums">{timeLabel}</span>
      </td>
      <td className="py-2 pr-3">{appointment.services?.name ?? t("list.serviceRemoved")}</td>
      <td className="py-2 pr-3">
        <span className="block">{appointment.customers?.name ?? t("list.unnamedCustomer")}</span>
        {appointment.customers?.phone ? (
          <span className="block text-xs text-on-surface-variant tabular-nums">
            {appointment.customers.phone}
          </span>
        ) : null}
      </td>
      <td className="py-2 pr-3">
        <span
          className={clsx(
            "inline-flex items-center rounded-full px-2 py-0.5 text-label-sm font-semibold",
            STATUS_TONE[appointment.status],
          )}
        >
          {t(`status.${appointment.status}`)}
        </span>
      </td>
      {canEdit ? (
        <td className="py-2 pr-3">
          {isTerminal ? (
            <span className="text-xs text-on-surface-variant">{t("list.noActions")}</span>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isLoading={isWorking}
                onClick={() => setStatus("completed")}
              >
                {t("actions.complete")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isLoading={isWorking}
                onClick={() => setStatus("no_show")}
              >
                {t("actions.noShow")}
              </Button>
              {confirmingCancel ? (
                <>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    isLoading={isWorking}
                    onClick={() => setStatus("cancelled")}
                  >
                    {t("actions.confirmCancel")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingCancel(false)}>
                    {t("actions.keep")}
                  </Button>
                </>
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmingCancel(true)}>
                  {t("actions.cancel")}
                </Button>
              )}
            </div>
          )}
        </td>
      ) : null}
    </tr>
  );
}
