"use client";

import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";

const BAR = "#4f46e5";

export type FunnelStep = { key: string; label: string; value: number };

export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const t = useTranslations("Metrics.view");
  const locale = useLocale();
  const numberFmt = new Intl.NumberFormat(locale);
  const max = Math.max(1, ...steps.map((s) => s.value));

  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const rate = prev && prev > 0 && step.value <= prev ? Math.round((step.value / prev) * 100) : null;
        const pct = (step.value / max) * 100;
        return (
          <li key={step.key} className="flex flex-col">
            <div className={clsx("flex items-baseline justify-between gap-3", i > 0 && "mt-4")}>
              <span className="text-sm font-medium text-on-surface">{step.label}</span>
              <span className="text-base font-semibold tabular-nums text-on-surface">
                {numberFmt.format(step.value)}
              </span>
            </div>
            <div className="mt-1.5 h-6 overflow-hidden rounded-r-[4px] bg-surface-container">
              <div
                className="billing-bar-in h-full origin-left rounded-r-[4px]"
                style={
                  {
                    width: `${step.value > 0 ? Math.max(1.5, pct) : 0}%`,
                    background: BAR,
                    opacity: 1 - i * 0.14,
                    animationDelay: `${100 + i * 90}ms`,
                  } as React.CSSProperties
                }
              />
            </div>
            {rate !== null ? (
              <p className="mt-1.5 text-[12px] tabular-nums text-on-surface-variant">{t("stepRate", { pct: rate })}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
