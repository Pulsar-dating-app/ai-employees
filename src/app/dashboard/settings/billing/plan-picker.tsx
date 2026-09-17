"use client";

import { useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { getSelfServePlansForVariant, type BillingPeriod, type PlanKey } from "@/lib/billing/plans";
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="inline-flex rounded-lg border border-outline-variant bg-surface-container p-1">
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
        <label className="inline-flex cursor-pointer items-center gap-2 text-label-md text-on-surface">
          <input
            type="checkbox"
            checked={whatsappIncluded}
            onChange={(e) => setWhatsappIncluded(e.target.checked)}
            className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
          />
          {t("picker.wppToggleLabel")}
        </label>
      </div>
      <p className="-mt-2 text-sm text-on-surface-variant">{t("picker.wppToggleNote")}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {plans.map((p) => {
          const offersTrial = p.trialReplyLimit != null && trialAvailable;
          return (
            <div
              key={p.key}
              className="flex flex-col rounded-lg border border-outline-variant/60 bg-surface-container-low p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-label-md font-bold text-on-surface">{p.displayName}</h3>
                {offersTrial ? (
                  <span className="inline-flex items-center rounded-full bg-tertiary/15 px-2.5 py-1 text-xs font-semibold text-tertiary">
                    {t("plan.trialBadge")}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-headline-lg font-semibold text-on-surface">
                  {/* Non-null: every plan in this loop is self-serve. */}
                  {BRL.format(p.priceBrlCents! / 100)}
                </span>
                <span className="text-sm text-on-surface-variant">
                  {p.billingPeriod === "annual" ? t("perYear") : t("perMonth")}
                </span>
              </div>
              <p className="mt-3 text-sm text-on-surface-variant">
                {p.billingPeriod === "annual"
                  ? t("plan.repliesAnnual", { limit: p.monthlyReplyLimit! })
                  : t("plan.replies", { limit: p.monthlyReplyLimit! })}
              </p>
              {offersTrial ? (
                <p className="mt-1 text-sm font-medium text-tertiary">
                  {t("plan.trialNote", { limit: p.trialReplyLimit! })}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-on-surface-variant">{t("plan.teammates")}</p>
              <div className="mt-5">
                {canEdit ? (
                  <CheckoutButton
                    companyId={companyId}
                    planKey={p.key as Exclude<PlanKey, "enterprise">}
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
