"use client";

import { useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { getSelfServePlansForVariant, type BillingPeriod, type PlanKey } from "@/lib/billing/plans";
import { CheckIcon } from "@/components/ui/icons";
import { CheckoutButton } from "./billing-actions";

// Trello P5, 2026-09-16 -- the "activate your team" plan grid, now that each
// self-serve tier has 4 catalog variants (monthly/annual x with/without
// WhatsApp, see plans.ts). Keeps the picker at 3 cards (one per tier) by
// filtering BILLING_PLANS down to whichever variant the two toggles below
// select, instead of listing all 12 self-serve plans flat.

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

export function PlanPicker({
  companyId,
  canEdit,
  trialAvailable,
}: {
  companyId: string;
  canEdit: boolean;
  trialAvailable: boolean;
}) {
  const t = useTranslations("Billing");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [whatsappIncluded, setWhatsappIncluded] = useState(false);

  const plans = getSelfServePlansForVariant(billingPeriod, whatsappIncluded);

  // Real number, not a marketing round-up: what a merchant actually pays
  // annually vs. 12 months of the same tier paid monthly (see plans.ts's
  // ANNUAL_MULTIPLIER comment -- the ratio is fixed by the catalog, so this
  // stays true even once the placeholder prices themselves change).
  const [monthlyRef] = getSelfServePlansForVariant("monthly", whatsappIncluded);
  const [annualRef] = getSelfServePlansForVariant("annual", whatsappIncluded);
  const annualSavingsPct =
    monthlyRef?.priceBrlCents && annualRef?.priceBrlCents
      ? Math.round((1 - annualRef.priceBrlCents / (monthlyRef.priceBrlCents * 12)) * 100)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-outline-variant/60 bg-surface-container p-1.5 shadow-level1">
          {(["monthly", "annual"] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setBillingPeriod(period)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-label-md font-semibold transition-all duration-150",
                billingPeriod === period
                  ? "bg-primary text-on-primary shadow-level1"
                  : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {t(`picker.period.${period}`)}
              {period === "annual" && annualSavingsPct ? (
                <span
                  className={clsx(
                    "rounded px-1.5 py-0.5 text-[11px] font-bold",
                    billingPeriod === "annual" ? "bg-on-primary/20 text-on-primary" : "bg-tertiary/15 text-tertiary",
                  )}
                >
                  −{annualSavingsPct}%
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-2.5 rounded-xl border border-outline-variant/60 bg-surface-container px-4 py-2.5 shadow-level1">
          <span className="text-label-md font-medium text-on-surface">{t("picker.wppToggleLabel")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={whatsappIncluded}
            onClick={() => setWhatsappIncluded((v) => !v)}
            className={clsx(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              whatsappIncluded ? "bg-primary" : "bg-outline-variant",
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

      <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 2xl:grid-cols-3">
        {plans.map((p) => {
          const offersTrial = p.trialReplyLimit != null && trialAvailable;
          const isRecommended = p.tier === "intermediate";
          return (
            <div
              key={p.key}
              className={clsx(
                "relative flex h-full flex-col rounded-xl border transition-all duration-200",
                isRecommended
                  ? "border-2 border-primary/70 bg-surface-container-lowest p-7 shadow-level2 ring-2 ring-primary/15"
                  : "border-outline-variant/60 bg-surface-container-lowest p-6 shadow-level1 hover:border-outline-variant hover:shadow-level2",
              )}
            >
              {isRecommended ? (
                <span className="absolute inset-x-0 -top-3 flex justify-center">
                  <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-label-sm font-semibold text-on-primary shadow-level1">
                    {t("picker.recommended")}
                  </span>
                </span>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-label-md font-bold text-on-surface">{p.displayName}</h3>
                {offersTrial ? (
                  <span className="inline-flex items-center rounded-full bg-tertiary/15 px-2.5 py-1 text-xs font-semibold text-tertiary">
                    {t("plan.trialBadge")}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span
                  className={clsx(
                    "font-semibold tracking-tight text-on-surface",
                    isRecommended ? "text-display-lg" : "text-headline-lg",
                  )}
                >
                  {/* Non-null: every plan in this loop is self-serve. */}
                  {BRL.format(p.priceBrlCents! / 100)}
                </span>
                <span className="text-sm text-on-surface-variant">
                  {p.billingPeriod === "annual" ? t("perYear") : t("perMonth")}
                </span>
              </div>

              <ul className="mt-5 flex flex-1 flex-col gap-2.5 border-t border-outline-variant/50 pt-5">
                <li className="flex items-start gap-2 text-sm text-on-surface-variant">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {p.billingPeriod === "annual"
                    ? t("plan.repliesAnnual", { limit: p.monthlyReplyLimit! })
                    : t("plan.replies", { limit: p.monthlyReplyLimit! })}
                </li>
                <li className="flex items-start gap-2 text-sm text-on-surface-variant">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {t("plan.teammates")}
                </li>
                {offersTrial ? (
                  <li className="flex items-start gap-2 text-sm font-medium text-tertiary">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-tertiary" />
                    {t("plan.trialNote", { limit: p.trialReplyLimit! })}
                  </li>
                ) : null}
              </ul>

              <div className="mt-6">
                {canEdit ? (
                  <CheckoutButton
                    companyId={companyId}
                    planKey={p.key as Exclude<PlanKey, "enterprise">}
                    variant={isRecommended ? "primary" : "secondary"}
                    label={
                      offersTrial
                        ? t("startTrial", { plan: p.displayName })
                        : t("choosePlan", { plan: p.displayName })
                    }
                    fullWidth
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
