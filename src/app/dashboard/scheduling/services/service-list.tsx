"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { XIcon } from "@/components/ui/icons";
import type { Service } from "./services-manager";

export function formatServicePrice(service: Service, locale: string): string | null {
  if (service.price == null) return null;
  const amount = Number(service.price);
  if (!service.currency) return new Intl.NumberFormat(locale, { minimumFractionDigits: 0 }).format(amount);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: service.currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

function PencilIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function ServiceRow({
  companyId,
  canEdit,
  service,
  index,
  onEdit,
  onPatched,
}: {
  companyId: string;
  canEdit: boolean;
  service: Service;
  index: number;
  onEdit: () => void;
  onPatched: (service: Service) => void;
}) {
  const t = useTranslations("Services.menu");
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const price = formatServicePrice(service, locale);

  async function send(method: "DELETE" | "PATCH") {
    setIsWorking(true);
    const res = await fetch(`/api/companies/${companyId}/services/${service.id}`, {
      method,
      headers: method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
      body: method === "PATCH" ? JSON.stringify({ is_active: true }) : undefined,
    }).catch(() => null);
    setIsWorking(false);
    if (!res?.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setConfirming(false);
    const json = await res.json();
    onPatched(json.service);
  }

  return (
    <li
      className="billing-card-in rounded-2xl transition-colors duration-200 hover:bg-surface-container-low/70"
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
    >
      <div className="flex flex-col gap-3 px-3 py-3.5 sm:flex-row sm:items-center sm:gap-6 sm:px-4">
        <div className="min-w-0 flex-1">
          <p
            className={clsx(
              "text-[15px] font-semibold",
              service.is_active ? "text-on-surface" : "text-on-surface-variant",
            )}
          >
            {service.name}
          </p>
          {service.description ? (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-on-surface-variant">{service.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-6 sm:contents">
          <div className="shrink-0 tabular-nums sm:w-32 sm:text-right">
            <p className="text-sm font-medium text-on-surface">
              {t("duration", { minutes: service.duration_minutes })}
            </p>
            {service.buffer_minutes > 0 ? (
              <p className="text-[12px] text-outline">{t("buffer", { minutes: service.buffer_minutes })}</p>
            ) : null}
          </div>
          <p
            className={clsx(
              "shrink-0 tabular-nums sm:w-28 sm:text-right",
              price ? "text-[15px] font-semibold text-on-surface" : "text-[13px] text-outline",
            )}
          >
            {price ?? t("priceVaries")}
          </p>
          {canEdit ? (
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0 sm:w-24 sm:justify-end">
              {service.is_active ? (
                <>
                  <button
                    type="button"
                    onClick={onEdit}
                    aria-label={t("edit", { name: service.name })}
                    title={t("edit", { name: service.name })}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-primary-fixed/60 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    aria-label={t("deactivate", { name: service.name })}
                    title={t("deactivate", { name: service.name })}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-outline transition-colors hover:bg-error-container/60 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => send("PATCH")}
                  className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-label-sm font-semibold text-on-surface transition-[border-color,color] hover:border-primary/40 hover:text-primary disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {t("reactivate")}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {failed ? (
        <p role="alert" className="mx-3 mb-2 text-sm text-error sm:mx-4">
          {t("actionError")}
        </p>
      ) : null}
      {confirming ? (
        <div className="inbox-pane-in mx-3 mb-3 flex flex-col gap-3 rounded-2xl bg-surface-container-low p-4 sm:mx-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-on-surface">{t("deactivatePrompt")}</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={isWorking}
              onClick={() => send("DELETE")}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-error px-4 text-label-sm font-semibold text-on-error transition-[filter] hover:brightness-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t("deactivateConfirm")}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setFailed(false);
              }}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-label-sm font-semibold text-on-surface transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
