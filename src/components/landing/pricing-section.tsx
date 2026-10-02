"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import type { BillingPeriod } from "@/lib/billing/plans";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { SalesContactDialog } from "./sales-contact-dialog";
import { CascadeText } from "./cascade-text";
import { M } from "./landing-icons";
import {
  LANDING_PLANS,
  META_MAX_CENTS_PER_REPLY,
  annualCents,
  maxMonthlySavingsCents,
  metaMaxCents,
  monthlyCents,
  type WhatsAppMode,
} from "./landing-plans";

const HIRE = "/?auth=signup";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
const BRL_WHOLE = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const BRL_UNIT = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function formatReais(cents: number): string {
  return cents % 100 === 0 ? BRL_WHOLE.format(cents / 100) : BRL_UNIT.format(cents / 100);
}

type LandingPlan = {
  tier: string;
  name: string;
  desc: string;
  price?: string;
  features?: string[];
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

function WhatsAppModeChoice({ value, onChange }: { value: WhatsAppMode; onChange: (next: WhatsAppMode) => void }) {
  const t = useTranslations("LandingV2.pricing.meta");
  return (
    <div className="w-full">
      <p id="wpp-mode-label" className="mb-3 text-center text-[15px] font-semibold text-[#0f172a]">
        {t("choiceLabel")}
      </p>
      <div role="radiogroup" aria-labelledby="wpp-mode-label" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["own", "managed"] as const).map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option)}
              className={clsx(
                "relative flex items-start gap-3 rounded-2xl bg-white p-4 text-left transition-[box-shadow] duration-200",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3525cd]",
                selected
                  ? "ring-2 ring-[#3525cd] shadow-[0_12px_32px_-18px_rgba(53,37,205,0.6)]"
                  : "ring-1 ring-[#e7e3f7] hover:ring-[#c7c0ef]",
              )}
            >
              <span
                aria-hidden="true"
                className={clsx(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  selected ? "border-[#3525cd]" : "border-[#c7c0ef]",
                )}
              >
                {selected ? <span className="h-2.5 w-2.5 rounded-full bg-[#3525cd]" /> : null}
              </span>
              <span className="flex-1">
                <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-[#0f172a]">
                  {t(`${option}.title`)}
                  {option === "own" ? (
                    <span className="rounded-full bg-[#d1fae5] px-2 py-0.5 text-[11px] font-bold text-[#047857]">
                      {t("own.badge")}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[13px] leading-5 text-[#464555]">{t(`${option}.desc`)}</span>
                {option === "own" ? (
                  <span className="mt-1 block text-[13px] leading-5 text-[#464555]">
                    {t("own.rate", { unit: BRL_UNIT.format(META_MAX_CENTS_PER_REPLY / 100) })}
                  </span>
                ) : null}
                {option === "own" ? (
                  <span className="mt-2 block text-[13px] font-semibold text-[#047857]">
                    {t("savings", { amount: BRL_WHOLE.format(maxMonthlySavingsCents() / 100) })}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NoWhatsAppBanner() {
  const t = useTranslations("LandingV2.pricing.meta");
  return (
    <div className="flex w-full items-start gap-3 rounded-2xl bg-[#ecfdf5] p-4 ring-1 ring-[#a7f3d0]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#047857]">
        <M name="verified" size={18} />
      </span>
      <span>
        <span className="block text-[15px] font-semibold text-[#064e3b]">{t("noWppTitle")}</span>
        <span className="mt-0.5 block text-[14px] leading-[21px] text-[#065f46]">{t("noWppBody")}</span>
      </span>
    </div>
  );
}

function OwnAccountCostBox({ monthlyReplies, staffraMonthlyCents }: { monthlyReplies: number; staffraMonthlyCents: number }) {
  const t = useTranslations("LandingV2.pricing.meta");
  const metaCents = metaMaxCents(monthlyReplies);
  return (
    <div className="mt-4 rounded-xl bg-[#f8fafc] p-3.5 ring-1 ring-[#e2e8f0]">
      <p className="text-[12px] font-semibold text-[#475569]">{t("cardLabel")}</p>
      <dl className="mt-2 flex flex-col gap-1.5 text-[14px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[#464555]">{t("cardNoWpp")}</dt>
          <dd className="font-semibold tabular-nums text-[#047857]">{t("cardNoWppValue")}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[#464555]">{t("cardWpp")}</dt>
          <dd className="font-semibold tabular-nums text-[#0f172a]">
            {t("cardWppValue", { price: BRL_WHOLE.format(metaCents / 100) })}
          </dd>
        </div>
      </dl>
      <p className="mt-2.5 border-t border-[#e2e8f0] pt-2.5 text-[13px] font-semibold tabular-nums text-[#0f172a]">
        {t("cardTotal", { total: BRL_WHOLE.format((staffraMonthlyCents + metaCents) / 100) })}
      </p>
    </div>
  );
}

function ManagedBox() {
  const t = useTranslations("LandingV2.pricing.meta");
  return (
    <div className="mt-4 rounded-xl bg-[#ecfdf5] p-3.5 ring-1 ring-[#a7f3d0]">
      <p className="flex items-start gap-1.5 text-[14px] font-semibold text-[#064e3b]">
        <M name="check_circle" size={16} className="mt-0.5 shrink-0 text-[#047857]" />
        {t("managedLine")}
      </p>
      <p className="mt-1 pl-[22px] text-[12px] leading-[18px] text-[#065f46]">{t("managedSub")}</p>
    </div>
  );
}

export function PricingSection() {
  const t = useTranslations("LandingV2.pricing");
  const plans = t.raw("plans") as LandingPlan[];
  const included = t.raw("included") as string[];
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [mode, setMode] = useState<WhatsAppMode>("own");

  const ref = LANDING_PLANS[0];
  const savingsPct = Math.round((1 - annualCents(ref, mode) / (monthlyCents(ref, mode) * 12)) * 100);
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

        <div className="mx-auto mb-10 flex max-w-3xl flex-col items-center gap-5">
          <PeriodSwitch value={billingPeriod} onChange={setBillingPeriod} savingsPct={savingsPct} />
          <WhatsAppModeChoice value={mode} onChange={setMode} />
          {mode === "own" ? <NoWhatsAppBanner /> : null}
        </div>

        <div className="grid grid-cols-1 items-stretch gap-5 pt-3 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, i) => {
            const featured = i === 1;
            const isContactPlan = i === plans.length - 1;
            const landingPlan = isContactPlan
              ? null
              : LANDING_PLANS.find((p) => p.tier === plan.tier.toLowerCase()) ?? null;
            const monthly = landingPlan ? monthlyCents(landingPlan, mode) : 0;
            const cents = landingPlan && billingPeriod === "annual" ? annualCents(landingPlan, mode) : monthly;
            const fullYearCents = landingPlan && billingPeriod === "annual" ? monthly * 12 : null;
            const replies = landingPlan?.monthlyReplies ?? 0;
            const perMonthCents = billingPeriod === "annual" ? cents / 12 : cents;

            return (
              <div key={plan.tier} className="billing-card-in h-full" style={{ "--i": i } as React.CSSProperties}>
                <div
                  className={clsx(
                    "relative flex h-full flex-col rounded-[24px] p-6 transition-[transform,box-shadow] duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] sm:p-7",
                    isContactPlan
                      ? "bg-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-24px_rgba(15,23,42,0.6)]"
                      : featured
                        ? "bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_28px_60px_-28px_rgba(53,37,205,0.5)] ring-2 ring-[#3525cd]"
                        : "bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-[#e7e3f7] hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-24px_rgba(53,37,205,0.3)]",
                  )}
                >
                  {featured ? (
                    <span className="absolute -top-3 left-6 rounded-full bg-[#3525cd] px-3 py-1 text-[12px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(53,37,205,0.6)]">
                      {t("featuredBadge")}
                    </span>
                  ) : null}
                  <h3 className={clsx("text-[18px] font-semibold", isContactPlan ? "text-white" : "text-[#0f172a]")}>
                    {plan.name}
                  </h3>
                  <p className={clsx("mt-1 text-[14px] leading-5", isContactPlan ? "text-[#cbd5e1]" : "text-[#464555]")}>
                    {plan.desc}
                  </p>

                  <div key={`${billingPeriod}-${mode}`} className="billing-price-in mt-6">
                    {isContactPlan ? (
                      <p className="text-[32px] font-semibold leading-none tracking-[-0.02em] text-white">
                        {plan.price}
                      </p>
                    ) : (
                      <>
                        {billingPeriod === "annual" ? (
                          <p className="mb-1.5 text-[15px] font-medium text-[#94a3b8] line-through tabular-nums">
                            {BRL.format(monthly / 100)}
                          </p>
                        ) : null}
                        <p className="flex items-baseline gap-1.5">
                          <span className="text-[36px] font-semibold leading-none tracking-[-0.025em] text-[#0f172a] tabular-nums">
                            {BRL_WHOLE.format(Math.round(perMonthCents / 100))}
                          </span>
                          <span className="text-[14px] text-[#464555]">{t("perMonth")}</span>
                        </p>
                        {fullYearCents ? (
                          <p className="mt-2 text-[13px] font-medium text-[#047857]">
                            {t("annualSavings", {
                              total: formatReais(cents),
                              saved: formatReais(fullYearCents - cents),
                            })}
                          </p>
                        ) : null}
                        {mode === "own" ? (
                          <OwnAccountCostBox
                            monthlyReplies={replies}
                            staffraMonthlyCents={Math.round(perMonthCents)}
                          />
                        ) : (
                          <ManagedBox />
                        )}
                      </>
                    )}
                  </div>

                  <div
                    className={clsx(
                      "mt-5 flex-1 border-t pt-5",
                      isContactPlan ? "border-white/10" : "border-[#efecf8]",
                    )}
                  >
                    {isContactPlan ? (
                      <ul className="flex flex-col gap-3">
                        {plan.features?.map((feature) => (
                          <li key={feature} className="flex items-start gap-2.5 text-[14px] leading-5 text-[#e2e8f0]">
                            <M name="check_circle" size={18} className="mt-px shrink-0 text-[#a5b4fc]" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="flex items-start gap-2.5 text-[15px] font-semibold text-[#0f172a]">
                        <M name="chat_bubble" size={18} className="mt-0.5 shrink-0 text-[#3525cd]" />
                        {t("repliesMonthly", { count: numberFmt.format(replies) })}
                      </p>
                    )}
                  </div>

                  <div className="mt-6">
                    {isContactPlan ? (
                      <SalesContactDialog
                        triggerLabel={plan.cta}
                        triggerClassName="group inline-flex h-12 w-full items-center justify-center rounded-xl bg-white text-[15px] font-semibold text-[#0f172a] transition-colors hover:bg-[#e2dfff]"
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

        <div className="mx-auto mt-8 max-w-5xl text-center">
          <p className="text-[14px] font-semibold text-[#0f172a]">{t("includedTitle")}</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {included.map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-[#464555] ring-1 ring-[#e7e3f7]"
              >
                <M name="check_circle" size={15} className="shrink-0 text-[#10b981]" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-balance text-center text-[15px] font-medium leading-6 text-[#0f172a]">
          <M name="verified" size={18} className="-mt-0.5 mr-1.5 inline-block align-middle text-[#10b981]" />
          {t("trialNote")}
        </p>

        <p className="mx-auto mt-4 max-w-3xl text-balance text-center text-[12px] leading-[18px] text-[#64748b]">
          {t("repliesNote")}
          {mode === "own" ? ` ${t("meta.footnote")}` : null}
        </p>
      </div>
    </section>
  );
}
