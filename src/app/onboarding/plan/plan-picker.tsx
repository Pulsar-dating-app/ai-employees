"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { finishOnboarding } from "@/lib/companies/finish-onboarding";
import { StepActions } from "../step-card";
import { OnboardingLoader } from "../onboarding-loader";

export type PlanOption = {
  key: string;
  name: string;
  priceLabel: string;
  replyLimit: string;
  features: string[];
};

export function PlanPicker({
  companyId,
  plans,
  trialDays,
  trialAvailable,
  checkoutCancelled,
}: {
  companyId: string;
  plans: PlanOption[];
  trialDays: number;
  trialAvailable: boolean;
  checkoutCancelled: boolean;
}) {
  const t = useTranslations("Onboarding.plan");

  const [selected, setSelected] = useState(plans[0]?.key ?? "");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!selected || isStarting) return;
    setError(null);
    setIsStarting(true);

    const res = await fetch(`/api/companies/${companyId}/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Comes back into the flow rather than dropping them in Settings.
      body: JSON.stringify({ planKey: selected, returnTo: "/onboarding/plan" }),
    });

    if (!res.ok) {
      setIsStarting(false);
      setError(t("error"));
      return;
    }

    const { url } = (await res.json()) as { url: string | null };
    if (!url) {
      setIsStarting(false);
      setError(t("error"));
      return;
    }

    window.location.href = url;
  }

  return (
    <div className="flex flex-col gap-7">
      {trialAvailable ? (
        <p className="rounded-lg bg-tertiary-container/15 px-4 py-3 text-body-md text-tertiary">
          {t("trialNote", { days: trialDays })}
        </p>
      ) : null}

      {checkoutCancelled ? (
        <p role="status" className="text-sm text-on-surface-variant">
          {t("cancelled")}
        </p>
      ) : null}

      <div role="radiogroup" aria-label={t("groupLabel")} className="grid gap-3 sm:grid-cols-2">
        {plans.map((plan, index) => {
          const active = plan.key === selected;
          return (
            <button
              key={plan.key}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active || (!selected && index === 0) ? 0 : -1}
              disabled={isStarting}
              onClick={() => setSelected(plan.key)}
              className={clsx(
                "relative flex flex-col gap-3 rounded-lg border p-5 text-left transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                "disabled:cursor-not-allowed disabled:opacity-70",
                active
                  ? "border-primary bg-primary-fixed/45 shadow-[0_8px_24px_-12px_rgba(53,37,205,0.45)]"
                  : "border-primary-fixed bg-white/70 hover:border-primary/40 hover:bg-white",
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200",
                  active ? "scale-100 bg-primary text-on-primary opacity-100" : "scale-75 opacity-0",
                )}
              >
                <CheckIcon className="h-3 w-3" />
              </span>

              <span className="text-body-lg font-semibold tracking-tight text-on-surface">
                {plan.name}
              </span>
              <span className="text-headline-md font-semibold tracking-tight text-on-surface tabular-nums">
                {plan.priceLabel}
              </span>
              <span className="text-label-md text-on-surface-variant">{plan.replyLimit}</span>

              <ul className="flex flex-col gap-1.5 pt-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-on-surface-variant">
                    <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      <StepActions>
        {/* Deciding later stays a real exit: she is parked, the dashboard
            alert says why, and nothing here traps the merchant. */}
        <form action={finishOnboarding} className="mr-auto">
          <button
            type="submit"
            className="rounded-md text-label-md font-medium text-on-surface-variant underline-offset-4 transition-colors hover:text-on-surface hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
          >
            {t("later")}
          </button>
        </form>
        <Button
          type="button"
          isLoading={isStarting}
          loadingIndicator={<OnboardingLoader />}
          disabled={!selected}
          onClick={start}
        >
          {trialAvailable ? t("ctaTrial") : t("cta")}
        </Button>
      </StepActions>
    </div>
  );
}
