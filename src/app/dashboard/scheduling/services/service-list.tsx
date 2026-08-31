"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import type { Service } from "./services-manager";

type ServiceListProps = {
  companyId: string;
  canEdit: boolean;
  services: Service[];
  isLoading: boolean;
  onEdit: (id: string) => void;
  onPatched: (service: Service) => void;
};

function formatPrice(service: Service): string {
  if (service.price == null) return "—";
  const amount = Number(service.price).toFixed(2);
  return service.currency ? `${service.currency} ${amount}` : amount;
}

export function ServiceList({ companyId, canEdit, services, isLoading, onEdit, onPatched }: ServiceListProps) {
  const t = useTranslations("Services");

  if (services.length === 0 && !isLoading) {
    return <p className="py-6 text-sm text-on-surface-variant">{t("filters.emptyState")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-outline-variant text-on-surface-variant">
            <th className="py-2 pr-3 font-medium">{t("list.nameColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.durationColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.priceColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.categoryColumn")}</th>
            <th className="py-2 pr-3 font-medium">{t("list.statusColumn")}</th>
            {canEdit ? <th className="py-2 pr-3 font-medium">{t("list.actionsColumn")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <ServiceRow
              key={service.id}
              companyId={companyId}
              canEdit={canEdit}
              service={service}
              onEdit={() => onEdit(service.id)}
              onPatched={onPatched}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServiceRow({
  companyId,
  canEdit,
  service,
  onEdit,
  onPatched,
}: {
  companyId: string;
  canEdit: boolean;
  service: Service;
  onEdit: () => void;
  onPatched: (service: Service) => void;
}) {
  const t = useTranslations("Services");
  const [confirming, setConfirming] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  async function handleDeactivate() {
    setIsWorking(true);
    const res = await fetch(`/api/companies/${companyId}/services/${service.id}`, { method: "DELETE" });
    setIsWorking(false);
    setConfirming(false);
    if (res.ok) {
      const json = await res.json();
      onPatched(json.service);
    }
  }

  async function handleReactivate() {
    setIsWorking(true);
    const res = await fetch(`/api/companies/${companyId}/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    setIsWorking(false);
    if (res.ok) {
      const json = await res.json();
      onPatched(json.service);
    }
  }

  return (
    <tr className={clsx("border-b border-outline-variant/60", !service.is_active && "opacity-50")}>
      <td className="py-2 pr-3">{service.name}</td>
      <td className="py-2 pr-3">
        <span className="tabular-nums">{t("list.durationValue", { minutes: service.duration_minutes })}</span>
        {/* Buffer is padding *after* the appointment (H1/H3 bake it into
            ends_at), so it only earns a mention when it's actually set. */}
        {service.buffer_minutes > 0 ? (
          <span className="block text-xs text-on-surface-variant tabular-nums">
            {t("list.bufferValue", { minutes: service.buffer_minutes })}
          </span>
        ) : null}
      </td>
      <td className="py-2 pr-3 tabular-nums">{formatPrice(service)}</td>
      <td className="py-2 pr-3">{service.category ?? t("list.empty")}</td>
      <td className="py-2 pr-3">
        <span
          className={clsx(
            "inline-flex items-center rounded-full px-2 py-0.5 text-label-sm font-semibold",
            service.is_active
              ? "bg-secondary-container/40 text-on-secondary-container"
              : "bg-surface-container text-on-surface-variant",
          )}
        >
          {service.is_active ? t("list.activeLabel") : t("list.inactiveLabel")}
        </span>
      </td>
      {canEdit ? (
        <td className="py-2 pr-3">
          <div className="flex items-center gap-2">
            {service.is_active ? (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
                  {t("form.editButton")}
                </Button>
                {confirming ? (
                  <>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      isLoading={isWorking}
                      onClick={handleDeactivate}
                    >
                      {t("delete.confirmButton")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                      {t("delete.cancelButton")}
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
                    {t("delete.deactivateButton")}
                  </Button>
                )}
              </>
            ) : (
              <Button type="button" variant="secondary" size="sm" isLoading={isWorking} onClick={handleReactivate}>
                {t("delete.reactivateButton")}
              </Button>
            )}
          </div>
        </td>
      ) : null}
    </tr>
  );
}
