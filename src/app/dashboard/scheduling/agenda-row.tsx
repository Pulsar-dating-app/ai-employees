"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { ChevronRightIcon, XIcon } from "@/components/ui/icons";
import { PREDEFINED_INTAKE_FIELDS } from "@/lib/appointments/intake-fields";
import type { Appointment, AppointmentStatus } from "./appointment-types";
import { clock } from "./agenda-format";

const PREDEFINED_INTAKE_LABELS: Record<string, string> = Object.fromEntries(
  PREDEFINED_INTAKE_FIELDS.map((f) => [f.key, f.label]),
);

function intakeKeyLabel(key: string): string {
  if (PREDEFINED_INTAKE_LABELS[key]) return PREDEFINED_INTAKE_LABELS[key];
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const STATUS_TONE: Record<AppointmentStatus, { dot: string; text: string; block: string }> = {
  requested: { dot: "bg-[#e0902f]", text: "text-[#8a5300]", block: "bg-[#fff1d6] ring-[#e0902f]/50 text-[#6b4a00]" },
  confirmed: {
    dot: "bg-primary",
    text: "text-primary",
    block: "bg-primary-fixed ring-primary/30 text-on-primary-fixed",
  },
  completed: {
    dot: "bg-success-500",
    text: "text-success-500",
    block: "bg-success-100 ring-success-500/30 text-success-500",
  },
  cancelled: {
    dot: "bg-outline",
    text: "text-outline",
    block: "bg-surface-container ring-outline-variant text-outline",
  },
  no_show: {
    dot: "bg-error",
    text: "text-error",
    block: "bg-error-container/60 ring-error/30 text-on-error-container",
  },
};

const ACTIONABLE: AppointmentStatus[] = ["requested", "confirmed"];

export function StatusTag({ status }: { status: AppointmentStatus }) {
  const t = useTranslations("Scheduling.appointments.status");
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-[12px] font-semibold", STATUS_TONE[status].text)}>
      <span aria-hidden="true" className={clsx("h-1.5 w-1.5 rounded-full", STATUS_TONE[status].dot)} />
      {t(status)}
    </span>
  );
}

export function useAppointmentStatus(companyId: string, appointmentId: string, onDone: () => void) {
  const [isWorking, setIsWorking] = useState(false);
  async function setStatus(status: AppointmentStatus, extra?: Record<string, unknown>) {
    setIsWorking(true);
    const res = await fetch(`/api/companies/${companyId}/appointments/${appointmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    }).catch(() => null);
    setIsWorking(false);
    if (res?.ok) onDone();
    return Boolean(res?.ok);
  }
  return { isWorking, setStatus };
}

export const PRIMARY_ACTION =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl bg-primary px-4 text-label-sm font-semibold text-on-primary shadow-[0_6px_16px_-8px_rgba(53,37,205,0.7)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60";
export const SECONDARY_ACTION =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-label-sm font-semibold text-on-surface transition-[border-color,color] duration-150 hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60";
const DANGER_ACTION =
  "inline-flex h-9 items-center justify-center rounded-xl bg-error px-4 text-label-sm font-semibold text-on-error transition-[filter] duration-150 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60";

export function DeclineForm({
  onConfirm,
  onCancel,
  isWorking,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isWorking: boolean;
}) {
  const t = useTranslations("Scheduling.appointments.actions");
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-surface-container-low p-4">
      <p className="text-sm text-on-surface">{t("declinePrompt")}</p>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("declineReasonPlaceholder")}
        maxLength={500}
        className="h-10 w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface outline-none transition-[border-color,box-shadow] placeholder:text-outline focus:border-primary/40 focus:shadow-[0_0_0_4px_rgba(53,37,205,0.08)]"
      />
      <div className="flex gap-2">
        <button type="button" disabled={isWorking} onClick={() => onConfirm(reason.trim())} className={DANGER_ACTION}>
          {t("confirmDecline")}
        </button>
        <button type="button" onClick={onCancel} className={SECONDARY_ACTION}>
          {t("keep")}
        </button>
      </div>
    </div>
  );
}

export function AgendaRow({
  companyId,
  timezone,
  canEdit,
  appointment,
  isPast,
  onPatched,
}: {
  companyId: string;
  timezone: string;
  canEdit: boolean;
  appointment: Appointment;
  isPast: boolean;
  onPatched: () => void;
}) {
  const t = useTranslations("Scheduling.appointments");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<"cancel" | "decline" | null>(null);
  const { isWorking, setStatus } = useAppointmentStatus(companyId, appointment.id, () => {
    setConfirming(null);
    onPatched();
  });

  const start = new Date(appointment.starts_at);
  const end = new Date(appointment.ends_at);
  const isTerminal = !ACTIONABLE.includes(appointment.status);
  const name = appointment.customers?.name ?? t("list.unnamedCustomer");
  const service = appointment.services?.name ?? t("list.serviceRemoved");
  const intakeEntries = Object.entries(appointment.intake_answers ?? {}).filter(
    ([, value]) => typeof value === "string" && value.trim() !== "",
  );
  const hasDetails = Boolean(appointment.summary || intakeEntries.length > 0 || appointment.cancellation_reason);

  return (
    <li
      className={clsx(
        "group/row rounded-2xl transition-colors duration-200",
        open ? "bg-surface-container-low" : "hover:bg-surface-container-low/70",
      )}
    >
      <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          disabled={!hasDetails}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default"
        >
          <span className="w-[4.5rem] shrink-0 tabular-nums">
            <span
              className={clsx(
                "block text-[15px] font-semibold",
                isTerminal ? "text-on-surface-variant" : "text-on-surface",
              )}
            >
              {clock(start, timezone, locale)}
            </span>
            <span className="block text-[12px] text-outline">{clock(end, timezone, locale)}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span
                className={clsx(
                  "block truncate text-[15px] font-semibold",
                  appointment.status === "cancelled" ? "text-outline line-through" : "text-on-surface",
                  isPast && appointment.status !== "cancelled" && "text-on-surface-variant",
                )}
              >
                {name}
              </span>
              {hasDetails ? (
                <ChevronRightIcon
                  aria-hidden="true"
                  className={clsx(
                    "h-4 w-4 shrink-0 text-outline transition-transform duration-200 sm:hidden",
                    open && "rotate-90",
                  )}
                />
              ) : null}
            </span>
            <span className="block truncate text-[13px] text-on-surface-variant">
              {service}
              {appointment.customers?.phone ? (
                <span className="hidden tabular-nums sm:inline"> · {appointment.customers.phone}</span>
              ) : null}
            </span>
            {appointment.customers?.phone ? (
              <span className="block whitespace-nowrap text-[13px] tabular-nums text-on-surface-variant sm:hidden">
                {appointment.customers.phone}
              </span>
            ) : null}
          </span>
          <span className="hidden w-36 shrink-0 sm:block">
            <StatusTag status={appointment.status} />
          </span>
        </button>

        <div className="flex flex-wrap items-center justify-between gap-2 pl-[5.25rem] sm:w-[18.5rem] sm:flex-nowrap sm:justify-end sm:pl-0">
          <span className="w-full sm:hidden">
            <StatusTag status={appointment.status} />
          </span>
          {canEdit && !isTerminal && !confirming ? (
            <div className="flex items-center gap-2">
              {appointment.status === "requested" ? (
                <>
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => setStatus("confirmed")}
                    className={PRIMARY_ACTION}
                  >
                    {t("actions.approve")}
                  </button>
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => {
                      setOpen(true);
                      setConfirming("decline");
                    }}
                    className={SECONDARY_ACTION}
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
                    className={SECONDARY_ACTION}
                  >
                    {t("actions.complete")}
                  </button>
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => setStatus("no_show")}
                    className={SECONDARY_ACTION}
                  >
                    {t("actions.noShow")}
                  </button>
                  <button
                    type="button"
                    title={t("actions.cancel")}
                    aria-label={t("actions.cancel")}
                    onClick={() => {
                      setOpen(true);
                      setConfirming("cancel");
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-outline transition-colors hover:bg-error-container/60 hover:text-error"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? t("board.hideDetails") : t("board.details")}
          disabled={!hasDetails}
          className={clsx(
            "hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors sm:flex",
            hasDetails ? "text-on-surface-variant hover:bg-surface-container" : "invisible",
          )}
        >
          <ChevronRightIcon className={clsx("h-4 w-4 transition-transform duration-200", open && "rotate-90")} />
        </button>
      </div>

      {open ? (
        <div className="inbox-pane-in flex flex-col gap-3 px-3 pb-4 sm:pl-[6.5rem] sm:pr-4">
          {confirming === "decline" ? (
            <DeclineForm
              isWorking={isWorking}
              onCancel={() => setConfirming(null)}
              onConfirm={(reason) => setStatus("cancelled", { cancellation_reason: reason || null })}
            />
          ) : null}
          {confirming === "cancel" ? (
            <div className="flex flex-col gap-2.5 rounded-2xl bg-surface-container-lowest p-4 ring-1 ring-outline-variant/60 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-on-surface">{t("actions.cancelPrompt")}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => setStatus("cancelled")}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-error px-4 text-label-sm font-semibold text-on-error transition-[filter] hover:brightness-95 disabled:opacity-60"
                >
                  {t("actions.confirmCancel")}
                </button>
                <button type="button" onClick={() => setConfirming(null)} className={SECONDARY_ACTION}>
                  {t("actions.keep")}
                </button>
              </div>
            </div>
          ) : null}
          {appointment.summary ? (
            <div>
              <p className="text-[12px] font-semibold text-on-surface-variant">{t("list.summaryLabel")}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-on-surface">{appointment.summary}</p>
            </div>
          ) : null}
          {intakeEntries.length > 0 ? (
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {intakeEntries.map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-[12px] font-semibold text-on-surface-variant">{intakeKeyLabel(key)}</dt>
                  <dd className="break-words text-sm text-on-surface">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {appointment.cancellation_reason ? (
            <p className="text-sm text-on-surface-variant">{appointment.cancellation_reason}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
