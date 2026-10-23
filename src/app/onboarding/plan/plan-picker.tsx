"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { intlTag } from "@/i18n/locales";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { finishOnboarding } from "@/lib/companies/finish-onboarding";
import { FREE_PLAN_KEY, getPlan, getSelfServePlansForVariant, type BillingPeriod } from "@/lib/billing/plans";
import { WhatsAppModeChoice } from "@/components/billing/whatsapp-mode-choice";
import { StepActions } from "../step-card";
import { OnboardingLoader } from "../onboarding-loader";

export function PlanPicker({
  companyId,
  trialDays,
  trialAvailable,
  checkoutCancelled,
  initialTier,
}: {
  companyId: string;
  trialDays: number;
  trialAvailable: boolean;
  checkoutCancelled: boolean;
  initialTier?: string | null;
}) {
  const t = useTranslations("Onboarding.plan");
  const locale = useLocale();
  const money = useMemo(
    () =>
      new Intl.NumberFormat(intlTag(locale), {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      }),
    [locale],
  );
  const count = useMemo(() => new Intl.NumberFormat(intlTag(locale)), [locale]);

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [whatsappIncluded, setWhatsappIncluded] = useState(false);
  const plans = getSelfServePlansForVariant(billingPeriod, whatsappIncluded);

  // Tracked by tier (Starter/Intermediate/Pro), not by the variant's exact
  // catalog key -- switching the period or WhatsApp toggle swaps every
  // plan's key underneath the same tier, and the merchant's choice of *which
  // tier* should survive that, not reset to the first card.
  // Staffra Free leads and starts selected: it's the way in we want people to
  // take -- unless the ad quiz already recommended a paid tier, which the
  // merchant was just shown as "your plan". Free has no period/WhatsApp
  // variants, so the toggles never swap it out from under the selection.
  const freePlan = getPlan(FREE_PLAN_KEY);
  const [selectedTier, setSelectedTier] = useState<string>(
    initialTier && plans.some((p) => p.tier === initialTier) ? initialTier : freePlan.tier,
  );
  const freeSelected = selectedTier === freePlan.tier;
  const selectedPlan = freeSelected
    ? freePlan
    : (plans.find((p) => p.tier === selectedTier) ?? plans[0] ?? null);

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
      {checkoutCancelled ? (
        <p role="status" className="text-sm text-on-surface-variant">
          {t("cancelled")}
        </p>
      ) : null}

      <div role="radiogroup" aria-label={t("groupLabel")} className="flex flex-col gap-7">
        <button
          type="button"
          role="radio"
          aria-checked={freeSelected}
          tabIndex={freeSelected ? 0 : -1}
          disabled={isStarting}
          onClick={() => setSelectedTier(freePlan.tier)}
          className={clsx(
            "relative flex flex-col gap-4 rounded-lg border-2 p-5 pt-7 text-left transition-all duration-200 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-6 sm:pt-7",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
            "disabled:cursor-not-allowed disabled:opacity-70",
            freeSelected
              ? "border-primary bg-primary-fixed/45 shadow-[0_12px_32px_-14px_rgba(53,37,205,0.55)]"
              : "border-primary/40 bg-white shadow-[0_8px_24px_-14px_rgba(53,37,205,0.35)] hover:border-primary/60",
          )}
        >
          <span className="absolute -top-3 left-5 inline-flex items-center rounded-full bg-primary px-3 py-1 text-label-sm font-semibold text-on-primary shadow-[0_4px_12px_-4px_rgba(53,37,205,0.5)]">
            {t("freeBadge")}
          </span>
          <span
            aria-hidden
            className={clsx(
              "absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200",
              freeSelected ? "scale-100 bg-primary text-on-primary opacity-100" : "scale-75 opacity-0",
            )}
          >
            <CheckIcon className="h-3 w-3" />
          </span>

          <span className="flex flex-col gap-2">
            <span className="text-body-lg font-semibold tracking-tight text-on-surface">{freePlan.displayName}</span>
            <span className="text-headline-md font-semibold tracking-tight text-on-surface tabular-nums">
              {t("perMonth", { price: money.format(0) })}
            </span>
            <span className="text-label-md text-on-surface-variant">
              {t("replyLimit", { count: count.format(freePlan.monthlyReplyLimit ?? 0) })}
            </span>
          </span>

          <ul className="flex flex-col gap-1.5 border-t border-primary-fixed pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            {[t("freeFeatureNoCard"), t("freeFeatureChannels")].map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-on-surface-variant">
                <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary" />
                {feature}
              </li>
            ))}
            <li className="pl-[22px] text-sm text-on-surface-variant/70">{t("freeNoWhatsapp")}</li>
          </ul>
        </button>

        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-primary-fixed" />
          <p className="text-center text-sm font-medium text-on-surface-variant">{t("orPaid")}</p>
          <span className="h-px flex-1 bg-primary-fixed" />
        </div>

        {trialAvailable && plans[0]?.trialReplyLimit != null ? (
          <p className="rounded-lg bg-tertiary-container/15 px-4 py-3 text-body-md text-tertiary">
            {t("trialNote", { days: trialDays, limit: plans[0].trialReplyLimit })}
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
        </div>
        <WhatsAppModeChoice whatsappIncluded={whatsappIncluded} onChange={setWhatsappIncluded} />

        <div className="grid items-stretch gap-4 sm:grid-cols-2">
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
          {freeSelected
            ? t("ctaFree", { plan: freePlan.displayName })
            : trialAvailable
              ? t("ctaTrial")
              : t("cta")}
        </Button>
      </StepActions>
    </div>
  );
}
