"use client";

import { useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import {
  findPlan,
  getSelfServePlansForVariant,
  type BillingPeriod,
  type BillingPlan,
  type PlanKey,
} from "@/lib/billing/plans";
import { CheckIcon, WhatsAppIcon } from "@/components/ui/icons";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { CheckoutButton } from "./billing-actions";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
const BRL_WHOLE = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const TIER_RANK = { starter: 0, intermediate: 1, pro: 2, enterprise: 3 } as const;

function PeriodSwitch({
  value,
  onChange,
  savingsPct,
}: {
  value: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
  savingsPct: number | null;
}) {
  const t = useTranslations("Billing.picker.period");
  const { indicatorRef, register } = useSlidingIndicator<HTMLButtonElement>(value, savingsPct, "x");

  return (
    <div role="radiogroup" className="relative inline-flex rounded-full bg-surface-container p-1">
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className="inbox-indicator absolute left-0 rounded-full bg-primary opacity-0 shadow-[0_6px_16px_-6px_rgba(53,37,205,0.6)]"
      />
      {(["monthly", "annual"] as const).map((period) => (
        <button
          key={period}
          ref={register(period)}
          type="button"
          role="radio"
          aria-checked={value === period}
          onClick={() => onChange(period)}
          className={clsx(
            "relative z-10 inline-flex h-10 items-center gap-2 rounded-full px-5 text-label-md font-semibold transition-colors duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            value === period ? "text-on-primary" : "text-on-surface-variant hover:text-on-surface",
          )}
        >
          {t(period)}
          {period === "annual" && savingsPct ? (
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums transition-colors duration-200",
                value === "annual" ? "bg-on-primary/20 text-on-primary" : "bg-success-100 text-success-500",
              )}
            >
              −{savingsPct}%
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function WhatsAppSwitch({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  const t = useTranslations("Billing.picker");
  return (
    <label className="inline-flex h-12 cursor-pointer items-center gap-3 rounded-full bg-surface-container py-1 pl-4 pr-1.5">
      <WhatsAppIcon className="h-4 w-4 text-[#1faa55]" />
      <span className="text-label-md font-medium text-on-surface">{t("wppToggleLabel")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={clsx(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          value ? "bg-primary" : "bg-outline-variant",
        )}
      >
        <span
          className={clsx(
            "inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(25,28,29,0.3)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            value ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </label>
  );
}

function Feature({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <li className={clsx("flex items-start gap-2.5 text-sm", muted ? "text-outline" : "text-on-surface-variant")}>
      <span
        className={clsx(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          muted ? "bg-surface-container" : "bg-primary-fixed text-primary",
        )}
      >
        <CheckIcon className="h-2.5 w-2.5" />
      </span>
      {children}
    </li>
  );
}

function TierCard({
  plan,
  index,
  highlighted,
  badge,
  action,
}: {
  plan: BillingPlan;
  index: number;
  highlighted: boolean;
  badge: string | null;
  action: React.ReactNode;
}) {
  const t = useTranslations("Billing");
  const isAnnual = plan.billingPeriod === "annual";
  const price = plan.priceBrlCents ?? 0;

  return (
    <div className="billing-card-in h-full" style={{ "--i": index } as React.CSSProperties}>
      <div
        className={clsx(
          "relative flex h-full flex-col rounded-[24px] p-6 transition-[transform,box-shadow] duration-300 sm:p-7",
          highlighted
            ? "bg-surface-container-lowest shadow-[0_1px_2px_rgba(25,28,29,0.04),0_28px_60px_-28px_rgba(53,37,205,0.45)] ring-2 ring-primary"
            : "bg-surface-container-lowest/80 shadow-[0_1px_2px_rgba(25,28,29,0.04)] ring-1 ring-outline-variant/60 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(25,28,29,0.04),0_20px_44px_-24px_rgba(53,37,205,0.3)]",
        )}
      >
        {badge ? (
          <span className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-primary px-3 py-1 text-[12px] font-semibold text-on-primary shadow-[0_6px_16px_-6px_rgba(53,37,205,0.6)]">
            {badge}
          </span>
        ) : null}

        <h3 className="text-base font-semibold text-on-surface">{plan.displayName}</h3>

        <div key={plan.key} className="billing-price-in mt-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[40px] font-semibold leading-none tracking-[-0.03em] text-on-surface tabular-nums">
              {BRL.format(price / 100)}
            </span>
            <span className="text-sm text-on-surface-variant">{isAnnual ? t("perYear") : t("perMonth")}</span>
          </div>
          {isAnnual ? (
            <p className="mt-2 text-[13px] text-on-surface-variant">
              {t("tiers.monthlyEquivalent", { price: BRL_WHOLE.format(Math.round(price / 1200)) })}
            </p>
          ) : null}
        </div>

        <ul className="mt-5 flex flex-1 flex-col gap-3 border-t border-outline-variant/50 pt-5">
          <Feature>
            <span className="font-semibold text-on-surface">
              {isAnnual
                ? t("plan.repliesAnnual", { limit: plan.monthlyReplyLimit ?? 0 })
                : t("plan.replies", { limit: plan.monthlyReplyLimit ?? 0 })}
            </span>
          </Feature>
          <Feature>{t("plan.teammates")}</Feature>
          <Feature muted={!plan.whatsappIncluded}>
            {plan.whatsappIncluded ? t("tiers.whatsappIncluded") : t("tiers.whatsappSeparate")}
          </Feature>
        </ul>

        <div className="mt-7">{action}</div>
      </div>
    </div>
  );
}

export function PlanTiers({
  companyId,
  canEdit,
  trialAvailable,
  currentPlanKey,
}: {
  companyId: string;
  canEdit: boolean;
  trialAvailable: boolean;
  currentPlanKey?: PlanKey;
}) {
  const t = useTranslations("Billing");
  const current = findPlan(currentPlanKey);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(current?.billingPeriod ?? "monthly");
  const [whatsappIncluded, setWhatsappIncluded] = useState(current?.whatsappIncluded ?? false);

  const plans = getSelfServePlansForVariant(billingPeriod, whatsappIncluded);
  const [monthlyRef] = getSelfServePlansForVariant("monthly", whatsappIncluded);
  const [annualRef] = getSelfServePlansForVariant("annual", whatsappIncluded);
  const savingsPct =
    monthlyRef?.priceBrlCents && annualRef?.priceBrlCents
      ? Math.round((1 - annualRef.priceBrlCents / (monthlyRef.priceBrlCents * 12)) * 100)
      : null;

  function actionFor(plan: BillingPlan, highlighted: boolean) {
    if (current && plan.key === current.key) {
      return (
        <div className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary-fixed/60 text-label-md font-semibold text-primary">
          <CheckIcon className="h-4 w-4" />
          {t("tiers.current")}
        </div>
      );
    }
    if (!canEdit) return null;
    const checkoutKey = plan.key as Exclude<PlanKey, "enterprise">;
    if (current) {
      const isUpgrade = TIER_RANK[plan.tier] > TIER_RANK[current.tier];
      return (
        <CheckoutButton
          companyId={companyId}
          planKey={checkoutKey}
          variant={isUpgrade ? "primary" : "secondary"}
          label={isUpgrade ? t("upgradeTo", { plan: plan.displayName }) : t("switchTo", { plan: plan.displayName })}
          fullWidth
        />
      );
    }
    const offersTrial = plan.trialReplyLimit != null && trialAvailable;
    return (
      <CheckoutButton
        companyId={companyId}
        planKey={checkoutKey}
        variant={highlighted ? "primary" : "secondary"}
        label={offersTrial ? t("startTrial", { plan: plan.displayName }) : t("choosePlan", { plan: plan.displayName })}
        fullWidth
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {current ? null : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PeriodSwitch value={billingPeriod} onChange={setBillingPeriod} savingsPct={savingsPct} />
            <WhatsAppSwitch value={whatsappIncluded} onChange={setWhatsappIncluded} />
          </div>
          <p className="max-w-xl text-balance text-center text-[13px] leading-5 text-on-surface-variant">
            {t("picker.wppToggleNote")}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 items-stretch gap-5 pt-3 md:grid-cols-3">
        {plans.map((plan, index) => {
          const isCurrent = current?.key === plan.key;
          const highlighted = current ? isCurrent : plan.tier === "intermediate";
          const badge = !current && highlighted ? t("picker.recommended") : null;
          return (
            <TierCard
              key={plan.tier}
              plan={plan}
              index={index}
              highlighted={highlighted}
              badge={badge}
              action={actionFor(plan, highlighted)}
            />
          );
        })}
      </div>
    </div>
  );
}
