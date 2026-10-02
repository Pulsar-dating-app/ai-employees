"use client";

import { useTranslations } from "next-intl";
import clsx from "clsx";

export function WhatsAppModeChoice({
  whatsappIncluded,
  onChange,
}: {
  whatsappIncluded: boolean;
  onChange: (whatsappIncluded: boolean) => void;
}) {
  const t = useTranslations("Billing.whatsappMode");
  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <p id="whatsapp-mode-label" className="text-center text-label-md font-semibold text-on-surface">
        {t("label")}
      </p>
      <div role="radiogroup" aria-labelledby="whatsapp-mode-label" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["own", "managed"] as const).map((option) => {
          const selected = (option === "managed") === whatsappIncluded;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option === "managed")}
              className={clsx(
                "flex items-start gap-3 rounded-xl border bg-white p-4 text-left transition-[border-color,box-shadow] duration-200",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                selected
                  ? "border-primary shadow-[0_8px_24px_-14px_rgba(53,37,205,0.5)]"
                  : "border-outline-variant hover:border-primary/40",
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  selected ? "border-primary" : "border-outline-variant",
                )}
              >
                {selected ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
              </span>
              <span className="flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-on-surface">
                  {t(`${option}.title`)}
                  {option === "own" ? (
                    <span className="rounded-full bg-success-100 px-2 py-0.5 text-[11px] font-bold text-success-500">
                      {t("own.badge")}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[13px] leading-5 text-on-surface-variant">{t(`${option}.desc`)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {!whatsappIncluded ? (
        <p className="text-balance text-center text-[13px] leading-5 text-on-surface-variant">{t("noWpp")}</p>
      ) : null}
    </div>
  );
}
