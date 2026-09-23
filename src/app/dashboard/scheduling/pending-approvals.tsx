"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Appointment } from "./appointment-types";
import { clock, dayHeading, localDateOf } from "./agenda-format";
import { DeclineForm, PRIMARY_ACTION, SECONDARY_ACTION, useAppointmentStatus } from "./agenda-row";

function PendingRow({
  companyId,
  timezone,
  today,
  appointment,
  canEdit,
  onPatched,
}: {
  companyId: string;
  timezone: string;
  today: string;
  appointment: Appointment;
  canEdit: boolean;
  onPatched: () => void;
}) {
  const t = useTranslations("Scheduling.appointments");
  const locale = useLocale();
  const [declining, setDeclining] = useState(false);
  const { isWorking, setStatus } = useAppointmentStatus(companyId, appointment.id, onPatched);
  const start = new Date(appointment.starts_at);
  const day = dayHeading(localDateOf(start, timezone), today, locale, {
    today: t("board.today"),
    tomorrow: t("board.tomorrow"),
  });

  return (
    <li className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-on-surface">
            {appointment.customers?.name ?? t("list.unnamedCustomer")}
          </p>
          <p className="truncate text-[13px] text-on-surface-variant">
            <span className="first-letter:uppercase">{day.primary}</span>
            <span className="tabular-nums"> · {clock(start, timezone, locale)}</span>
            {" · "}
            {appointment.services?.name ?? t("list.serviceRemoved")}
          </p>
        </div>
        {canEdit && !declining ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={isWorking}
              onClick={() => setStatus("confirmed")}
              className={PRIMARY_ACTION}
            >
              {t("actions.approve")}
            </button>
            <button type="button" disabled={isWorking} onClick={() => setDeclining(true)} className={SECONDARY_ACTION}>
              {t("actions.decline")}
            </button>
          </div>
        ) : null}
      </div>
      {declining ? (
        <DeclineForm
          isWorking={isWorking}
          onCancel={() => setDeclining(false)}
          onConfirm={(reason) => setStatus("cancelled", { cancellation_reason: reason || null })}
        />
      ) : null}
      {appointment.summary ? (
        <p className="line-clamp-2 text-[13px] leading-5 text-on-surface-variant">{appointment.summary}</p>
      ) : null}
    </li>
  );
}

export function PendingApprovals({
  companyId,
  timezone,
  today,
  appointments,
  total,
  canEdit,
  onPatched,
}: {
  companyId: string;
  timezone: string;
  today: string;
  appointments: Appointment[];
  total: number;
  canEdit: boolean;
  onPatched: () => void;
}) {
  const t = useTranslations("Scheduling.appointments.board");
  if (appointments.length === 0) return null;

  return (
    <section className="rounded-[24px] border border-[#f3d27a] bg-[#fffaf0] p-5 sm:p-6">
      <h2 className="flex items-center gap-2.5 text-base font-semibold text-[#5c3d00]">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#f0b429] px-1.5 text-[12px] font-bold tabular-nums text-[#3d2a00]">
          {Math.max(total, appointments.length)}
        </span>
        {t("pendingTitle")}
      </h2>
      <ul className="mt-4 divide-y divide-[#f3d27a]/70">
        {appointments.map((appointment) => (
          <PendingRow
            key={appointment.id}
            companyId={companyId}
            timezone={timezone}
            today={today}
            appointment={appointment}
            canEdit={canEdit}
            onPatched={onPatched}
          />
        ))}
      </ul>
    </section>
  );
}
