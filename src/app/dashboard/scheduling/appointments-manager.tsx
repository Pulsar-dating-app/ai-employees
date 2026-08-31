"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { AppointmentList } from "./appointment-list";
import { APPOINTMENT_STATUSES, type Appointment, type AppointmentStatus } from "./appointment-types";

type Scope = "upcoming" | "past";

type AppointmentsManagerProps = {
  companyId: string;
  timezone: string;
  canEdit: boolean;
  initialAppointments: Appointment[];
  initialTotal: number;
  pageSize: number;
};

export function AppointmentsManager({
  companyId,
  timezone,
  canEdit,
  initialAppointments,
  initialTotal,
  pageSize,
}: AppointmentsManagerProps) {
  const t = useTranslations("Scheduling.appointments");

  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [total, setTotal] = useState(initialTotal);
  const [scope, setScope] = useState<Scope>("upcoming");
  const [status, setStatus] = useState<"" | AppointmentStatus>("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

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

  function changeScope(nextScope: Scope) {
    setScope(nextScope);
    setPage(1);
    refetch({ scope: nextScope, status, page: 1 });
  }

  function changeStatus(nextStatus: "" | AppointmentStatus) {
    setStatus(nextStatus);
    setPage(1);
    refetch({ scope, status: nextStatus, page: 1 });
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    refetch({ scope, status, page: nextPage });
  }

  // A status change can move a row out of the current filter, so re-fetch
  // rather than patching in place — otherwise "show only confirmed" keeps
  // displaying the one you just cancelled.
  function handlePatched() {
    refetch({ scope, status, page });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pageTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 border-b border-outline-variant pb-4 sm:flex-row sm:items-end sm:gap-4">
          <div className="flex rounded-lg bg-surface-container p-1" role="group" aria-label={t("scopeLabel")}>
            {(["upcoming", "past"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => changeScope(value)}
                className={
                  scope === value
                    ? "rounded-md bg-surface px-3 py-1.5 text-sm font-semibold text-on-surface shadow-sm"
                    : "rounded-md px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface"
                }
              >
                {t(`scope.${value}`)}
              </button>
            ))}
          </div>

          <div className="min-w-0 sm:w-56">
            <Select
              label={t("statusFilterLabel")}
              value={status}
              onChange={(e) => changeStatus(e.target.value as "" | AppointmentStatus)}
              options={[
                { value: "", label: t("statusFilterAll") },
                ...APPOINTMENT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
              ]}
            />
          </div>
        </div>

        <AppointmentList
          companyId={companyId}
          timezone={timezone}
          canEdit={canEdit}
          appointments={appointments}
          isLoading={isLoading}
          onPatched={handlePatched}
        />

        <div className="flex items-center justify-between pt-2">
          <Button variant="secondary" size="sm" disabled={page <= 1 || isLoading} onClick={() => changePage(page - 1)}>
            {t("previousPage")}
          </Button>
          <span className="text-sm text-on-surface-variant">{t("pageOf", { page, totalPages })}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page * pageSize >= total || isLoading}
            onClick={() => changePage(page + 1)}
          >
            {t("nextPage")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
