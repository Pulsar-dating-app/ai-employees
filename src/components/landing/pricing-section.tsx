"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { getSelfServePlansForVariant, type BillingPeriod, type PlanTier } from "@/lib/billing/plans";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { SalesContactDialog } from "./sales-contact-dialog";
import { CascadeText } from "./cascade-text";
import { M } from "./landing-icons";

const HIRE = "/?auth=signup";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
const BRL_WHOLE = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type LandingPlan = {
  tier: string;
  name: string;
  desc: string;
  price?: string;
  priceNote?: string;
  cta: string;
};

function PeriodSwitch({
  value,
  onChange,
  savingsPct,
}: {
  value: BillingPeriod;
  onChange: (next: BillingPeriod) => void;
  savingsPct: number | null;
}) {
  const t = useTranslations("LandingV2.pricing");
  const { indicatorRef, register } = useSlidingIndicator<HTMLButtonElement>(value, savingsPct, "x");
  return (
    <div
      role="radiogroup"
      aria-label={t("periodLabel")}
      className="relative inline-flex rounded-full bg-white p-1 shadow-[0_4px_24px_rgba(79,70,229,0.08)]"
    >
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className="inbox-indicator absolute left-0 rounded-full bg-[#3525cd] opacity-0 shadow-[0_6px_16px_-6px_rgba(53,37,205,0.6)]"
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
            "relative z-10 inline-flex h-10 items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3525cd]",
            value === period ? "text-white" : "text-[#464555] hover:text-[#0f172a]",
          )}
        >
          {t(`periodToggle.${period}`)}
          {period === "annual" && savingsPct ? (
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums transition-colors duration-200",
                value === "annual" ? "bg-white/20 text-white" : "bg-[#d1fae5] text-[#047857]",
              )}
            >
              {t("savings", { pct: savingsPct })}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function PricingSection() {
  const t = useTranslations("LandingV2.pricing");
  const plans = t.raw("plans") as LandingPlan[];
  const included = t.raw("included") as string[];
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [whatsappIncluded, setWhatsappIncluded] = useState(false);

  const selfServePlans = getSelfServePlansForVariant(billingPeriod, whatsappIncluded);
  const [monthlyRef] = getSelfServePlansForVariant("monthly", whatsappIncluded);
  const [annualRef] = getSelfServePlansForVariant("annual", whatsappIncluded);
  const savingsPct =
    monthlyRef?.priceBrlCents && annualRef?.priceBrlCents
      ? Math.round((1 - annualRef.priceBrlCents / (monthlyRef.priceBrlCents * 12)) * 100)
      : null;
  const numberFmt = new Intl.NumberFormat("pt-BR");

  return (
    <section id="planos" className="w-full bg-[#f5f2ff] py-16">
      <div className="mx-auto max-w-[1320px] px-4 md:px-10">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h2 className="text-balance text-[28px] font-semibold leading-[34px] tracking-[-0.015em] text-[#0f172a] sm:text-[36px] sm:leading-[44px]">
            {t("heading")}
          </h2>
          <p className="mt-3 text-[17px] leading-[26px] text-[#464555]">{t("sub")}</p>
        </div>

        <div className="mx-auto mb-10 flex max-w-3xl flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PeriodSwitch value={billingPeriod} onChange={setBillingPeriod} savingsPct={savingsPct} />
            <label className="inline-flex h-12 cursor-pointer items-center gap-3 rounded-full bg-white py-1 pl-4 pr-1.5 shadow-[0_4px_24px_rgba(79,70,229,0.08)]">
              <span className="text-[14px] font-medium text-[#0f172a]">{t("wppToggleLabel")}</span>
              <button
                type="button"
                role="switch"
                aria-checked={whatsappIncluded}
                onClick={() => setWhatsappIncluded((v) => !v)}
                className={clsx(
                  "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3525cd]",
                  whatsappIncluded ? "bg-[#3525cd]" : "bg-[#d8d4ee]",
                )}
              >
                <span
                  className={clsx(
                    "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    whatsappIncluded ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </button>
            </label>
          </div>
          <p className="max-w-lg text-balance text-center text-[13px] leading-5 text-[#64748b]">
            {whatsappIncluded ? t("wppToggleNoteOn") : t("wppToggleNote")}
          </p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-5 pt-3 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, i) => {
            const featured = i === 1;
            const isContactPlan = i === plans.length - 1;
            const catalogPlan = isContactPlan
              ? null
              : selfServePlans.find((p) => p.tier === (plan.tier.toLowerCase() as PlanTier));
            const cents = catalogPlan?.priceBrlCents ?? 0;
            const perDayCents = billingPeriod === "annual" ? cents / 365 : cents / 30;
            const replies = catalogPlan?.monthlyReplyLimit ?? 0;

            return (
              <div key={plan.tier} className="billing-card-in h-full" style={{ "--i": i } as React.CSSProperties}>
                <div
                  className={clsx(
                    "relative flex h-full flex-col rounded-[24px] bg-white p-6 transition-[transform,box-shadow] duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] sm:p-7",
                    featured
                      ? "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_28px_60px_-28px_rgba(53,37,205,0.5)] ring-2 ring-[#3525cd]"
                      : "shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-[#e7e3f7] hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-24px_rgba(53,37,205,0.3)]",
                  )}
                >
                  {featured ? (
                    <span className="absolute -top-3 left-6 rounded-full bg-[#3525cd] px-3 py-1 text-[12px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(53,37,205,0.6)]">
                      {t("featuredBadge")}
                    </span>
                  ) : null}
                  <h3 className="text-[18px] font-semibold text-[#0f172a]">{plan.name}</h3>
                  <p className="mt-1 text-[14px] leading-5 text-[#464555]">{plan.desc}</p>

                  <div key={`${billingPeriod}-${whatsappIncluded}`} className="billing-price-in mt-6">
                    {isContactPlan ? (
                      <>
                        <p className="text-[32px] font-semibold leading-none tracking-[-0.02em] text-[#0f172a]">
                          {plan.price}
                        </p>
                        <p className="mt-2 text-[13px] text-[#64748b]">{plan.priceNote}</p>
                      </>
                    ) : (
                      <>
                        <p className="flex items-baseline gap-1.5">
                          <span className="text-[36px] font-semibold leading-none tracking-[-0.025em] text-[#0f172a] tabular-nums">
                            {BRL.format(cents / 100)}
                          </span>
                          <span className="text-[14px] text-[#464555]">
                            {billingPeriod === "annual" ? t("perYear") : t("perMonth")}
                          </span>
                        </p>
                        <p className="mt-2 text-[13px] font-medium text-[#3525cd]">
                          {t("perDay", { price: BRL_WHOLE.format(Math.ceil(perDayCents / 100)) })}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="mt-5 flex-1 border-t border-[#efecf8] pt-5">
                    {isContactPlan ? null : (
                      <p className="flex items-start gap-2.5 text-[15px] font-semibold text-[#0f172a]">
                        <M name="chat_bubble" size={18} className="mt-0.5 shrink-0 text-[#3525cd]" />
                        {t(billingPeriod === "annual" ? "repliesAnnual" : "repliesMonthly", {
                          count: numberFmt.format(replies),
                        })}
                      </p>
                    )}
                  </div>

                  <div className="mt-6">
                    {isContactPlan ? (
                      <SalesContactDialog
                        triggerLabel={plan.cta}
                        triggerClassName="group inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#0f172a] text-[15px] font-semibold text-white transition-colors hover:bg-[#3525cd]"
                      >
                        <CascadeText text={plan.cta} />
                      </SalesContactDialog>
                    ) : (
                      <Link
                        href={HIRE}
                        aria-label={plan.cta}
                        className={clsx(
                          "group inline-flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold transition-[background-color,color,box-shadow]",
                          featured
                            ? "bg-[#3525cd] text-white shadow-[0_10px_24px_-10px_rgba(53,37,205,0.7)] hover:bg-[#4f46e5]"
                            : "bg-[#eae6f4] text-[#0f172a] hover:bg-[#0f172a] hover:text-white",
                        )}
                      >
                        <CascadeText text={plan.cta} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[13px] text-[#64748b]">{t("repliesNote")}</p>

        <div className="mx-auto mt-10 max-w-4xl rounded-[24px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-[#e7e3f7] sm:p-8">
          <h3 className="text-[18px] font-semibold text-[#0f172a]">{t("includedTitle")}</h3>
          <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[15px] leading-6 text-[#464555]">
                <M name="check_circle" size={18} className="mt-0.5 shrink-0 text-[#10b981]" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-balance text-center text-[15px] font-medium leading-6 text-[#0f172a]">
          <M name="verified" size={18} className="-mt-0.5 mr-1.5 inline-block align-middle text-[#10b981]" />
          {t("trialNote")}
        </p>
      </div>
    </section>
  );
}
