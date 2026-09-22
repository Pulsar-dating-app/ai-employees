"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { finishOnboarding } from "@/lib/companies/finish-onboarding";
import { getSelfServePlansForVariant, type BillingPeriod } from "@/lib/billing/plans";
import { StepActions } from "../step-card";
import { OnboardingLoader } from "../onboarding-loader";

export function PlanPicker({
  companyId,
  trialDays,
  trialAvailable,
  checkoutCancelled,
}: {
  companyId: string;
  trialDays: number;
  trialAvailable: boolean;
  checkoutCancelled: boolean;
}) {
  const t = useTranslations("Onboarding.plan");
  const locale = useLocale();
  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      }),
    [locale],
  );
  const count = useMemo(() => new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US"), [locale]);

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [whatsappIncluded, setWhatsappIncluded] = useState(false);
  const plans = getSelfServePlansForVariant(billingPeriod, whatsappIncluded);

  // Tracked by tier (Starter/Intermediate/Pro), not by the variant's exact
  // catalog key -- switching the period or WhatsApp toggle swaps every
  // plan's key underneath the same tier, and the merchant's choice of *which
  // tier* should survive that, not reset to the first card.
  const [selectedTier, setSelectedTier] = useState(plans[0]?.tier ?? "");
  const selectedPlan = plans.find((p) => p.tier === selectedTier) ?? plans[0] ?? null;

  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!selectedPlan || isStarting) return;
    setError(null);
    setIsStarting(true);

    const res = await fetch(`/api/companies/${companyId}/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Comes back into the flow rather than dropping them in Settings.
      body: JSON.stringify({ planKey: selectedPlan.key, returnTo: "/onboarding/plan" }),
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
      {trialAvailable && plans[0]?.trialReplyLimit != null ? (
        <p className="rounded-lg bg-tertiary-container/15 px-4 py-3 text-body-md text-tertiary">
          {t("trialNote", { days: trialDays, limit: plans[0].trialReplyLimit })}
        </p>
      ) : null}

      {checkoutCancelled ? (
        <p role="status" className="text-sm text-on-surface-variant">
          {t("cancelled")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-primary-fixed bg-white/70 p-1">
          {(["monthly", "annual"] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setBillingPeriod(period)}
              className={clsx(
                "rounded-md px-4 py-1.5 text-label-md font-semibold transition-colors",
                billingPeriod === period
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {t(`picker.period.${period}`)}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-2.5 rounded-lg border border-primary-fixed bg-white/70 px-3 py-2">
          <span className="text-label-md font-medium text-on-surface">{t("picker.wppToggleLabel")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={whatsappIncluded}
            onClick={() => setWhatsappIncluded((v) => !v)}
            className={clsx(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              whatsappIncluded ? "bg-primary" : "bg-primary-fixed",
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                whatsappIncluded ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        </div>
      </div>
      <p className="-mt-3 text-sm text-on-surface-variant">{t("picker.wppToggleNote")}</p>

      <div role="radiogroup" aria-label={t("groupLabel")} className="grid items-stretch gap-4 sm:grid-cols-2">
        {plans.map((plan, index) => {
          const active = plan.tier === selectedTier;
          const isRecommended = plan.tier === "intermediate";
          const priceLabel =
            billingPeriod === "annual"
              ? t("perYear", { price: money.format((plan.priceBrlCents ?? 0) / 100) })
              : t("perMonth", { price: money.format((plan.priceBrlCents ?? 0) / 100) });
          const replyLimitLabel =
            billingPeriod === "annual"
              ? t("replyLimitAnnual", { count: count.format(plan.monthlyReplyLimit ?? 0) })
              : t("replyLimit", { count: count.format(plan.monthlyReplyLimit ?? 0) });
          const features = [t("featureChannels"), t("featureTeam"), t("featureHistory")];
          return (
            <button
              key={plan.tier}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active || (!selectedTier && index === 0) ? 0 : -1}
              disabled={isStarting}
              onClick={() => setSelectedTier(plan.tier)}
              className={clsx(
                "relative flex flex-col gap-3 rounded-lg border p-5 pt-6 text-left transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                "disabled:cursor-not-allowed disabled:opacity-70",
                active
                  ? "border-primary bg-primary-fixed/45 shadow-[0_8px_24px_-12px_rgba(53,37,205,0.45)]"
                  : isRecommended
                    ? "border-primary/40 bg-white shadow-[0_8px_24px_-14px_rgba(53,37,205,0.35)] hover:border-primary/60"
                    : "border-primary-fixed bg-white/70 hover:border-primary/40 hover:bg-white",
              )}
            >
              {isRecommended ? (
                <span className="absolute inset-x-0 -top-3 flex justify-center">
                  <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-label-sm font-semibold text-on-primary shadow-[0_4px_12px_-4px_rgba(53,37,205,0.5)]">
                    {t("recommended")}
                  </span>
                </span>
              ) : null}

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
                {plan.displayName}
              </span>
              <span className="text-headline-md font-semibold tracking-tight text-on-surface tabular-nums">
                {priceLabel}
              </span>
              <span className="text-label-md text-on-surface-variant">{replyLimitLabel}</span>

              <ul className="flex flex-col gap-1.5 border-t border-primary-fixed pt-3">
                {features.map((feature) => (
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
          disabled={!selectedPlan}
          onClick={start}
        >
          {trialAvailable ? t("ctaTrial") : t("cta")}
        </Button>
      </StepActions>
    </div>
  );
}
