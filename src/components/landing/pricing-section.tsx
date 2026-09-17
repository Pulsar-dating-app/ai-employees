"use client";

import { useState } from "react";
import Link from "next/link";
import { getSelfServePlansForVariant, type BillingPeriod, type PlanTier } from "@/lib/billing/plans";
import { PlanFeatures, PlanFeaturesProvider } from "./plan-features";
import { SalesContactDialog } from "./sales-contact-dialog";
import { CascadeText } from "./cascade-text";

// Public landing pricing (section 7) — 2026-09-17. Was static copy (fabricated
// R$ figures per plan, see decisions.md 2026-09-06); now a client component so
// it can carry the same period/WhatsApp toggles as the dashboard's PlanPicker
// (`src/app/dashboard/settings/billing/plan-picker.tsx`) and price the 3
// self-serve cards straight from the real catalog (`plans.ts`) instead of a
// hand-typed number. Only price/priceSuffix/priceNote are computed — name,
// desc, features and cta stay translated marketing copy (`LandingV2.pricing`),
// since those aren't billing-catalog concerns. Enterprise (the 4th, contact-us
// card) is unaffected by either toggle and keeps its own static copy.

const HIRE = "/?auth=signup";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

type Plan = {
  tier: string;
  name: string;
  desc: string;
  price?: string;
  priceSuffix?: string;
  priceNote?: string;
  features: string[];
  cta: string;
};

export type PricingCopy = {
  eyebrow: string;
  heading: string;
  sub: string;
  featuredBadge: string;
  showMore: string;
  showLess: string;
  periodMonthly: string;
  periodAnnual: string;
  wppToggleLabel: string;
  wppToggleNote: string;
  priceNoteMonthly: string;
  priceNoteAnnual: string;
  perMonth: string;
  perYear: string;
};

export function PricingSection({ plans, copy }: { plans: Plan[]; copy: PricingCopy }) {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [whatsappIncluded, setWhatsappIncluded] = useState(false);

  const selfServePlans = getSelfServePlansForVariant(billingPeriod, whatsappIncluded);

  return (
    <section id="planos" className="w-full bg-[#f5f2ff] py-12">
      <div className="mx-auto max-w-[1440px] px-4 md:px-10">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#3525cd]">{copy.eyebrow}</span>
          <h2 className="mt-3 text-[26px] font-semibold leading-[32px] tracking-[-0.01em] text-[#0f172a] sm:text-[32px] sm:leading-[40px]">
            {copy.heading}
          </h2>
          <p className="mt-2 text-[16px] leading-[24px] text-[#464555]">{copy.sub}</p>
        </div>

        <div className="mx-auto mb-10 flex max-w-2xl flex-col items-center gap-4">
          <div className="inline-flex rounded-full border border-[#e2dfff] bg-white p-1 shadow-[0_4px_24px_rgba(79,70,229,0.04)]">
            {(["monthly", "annual"] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setBillingPeriod(period)}
                className={`rounded-full px-5 py-2 text-[13px] font-semibold transition-colors ${
                  billingPeriod === period ? "bg-[#3525cd] text-white" : "text-[#464555] hover:text-[#0f172a]"
                }`}
              >
                {period === "monthly" ? copy.periodMonthly : copy.periodAnnual}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-2.5 rounded-full border border-[#e2dfff] bg-white px-4 py-2 shadow-[0_4px_24px_rgba(79,70,229,0.04)]">
            <span className="text-[14px] font-medium text-[#0f172a]">{copy.wppToggleLabel}</span>
            <button
              type="button"
              role="switch"
              aria-checked={whatsappIncluded}
              onClick={() => setWhatsappIncluded((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                whatsappIncluded ? "bg-[#3525cd]" : "bg-[#e2dfff]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  whatsappIncluded ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          <p className="max-w-md text-center text-[13px] leading-[18px] text-[#64748b]">{copy.wppToggleNote}</p>
        </div>

        <PlanFeaturesProvider>
          <div className="grid grid-cols-1 items-stretch gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan, i) => {
              // The middle self-serve plan gets the "most chosen" badge --
              // classic anchor-the-buyer-off-the-cheapest-tier pricing
              // psychology, not "whichever plan happens to be Pro". Deliberately
              // index-based (the middle *position*), not a `plan.tier === "Pro"`
              // check, so it keeps following whichever plan is visually in the
              // middle if the lineup changes again.
              const featured = i === 1;
              // The last plan is always the contact-us tier (Enterprise) --
              // length-relative, not a hardcoded index, so inserting a
              // self-serve plan earlier in the array doesn't silently
              // misroute this.
              const isContactPlan = i === plans.length - 1;
              const catalogPlan = isContactPlan
                ? null
                : selfServePlans.find((p) => p.tier === (plan.tier.toLowerCase() as PlanTier));

              const priceLabel = isContactPlan ? plan.price : catalogPlan ? BRL.format(catalogPlan.priceBrlCents! / 100) : "";
              const priceSuffix = isContactPlan
                ? plan.priceSuffix
                : billingPeriod === "annual"
                  ? copy.perYear
                  : copy.perMonth;
              const priceNote = isContactPlan
                ? plan.priceNote
                : billingPeriod === "annual"
                  ? copy.priceNoteAnnual
                  : copy.priceNoteMonthly;

              return (
                <div
                  key={plan.name}
                  className={`relative flex flex-col justify-between rounded-xl bg-white p-6 transition-[transform,box-shadow] duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 ${
                    featured
                      ? "shadow-[0_12px_40px_rgba(53,37,205,0.12)] ring-2 ring-[#3525cd] hover:shadow-[0_24px_56px_rgba(53,37,205,0.2)]"
                      : "shadow-[0_4px_24px_rgba(79,70,229,0.04)] hover:shadow-[0_16px_40px_rgba(79,70,229,0.14)]"
                  }`}
                >
                  {featured && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#3525cd] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-sm">
                      {copy.featuredBadge}
                    </div>
                  )}
                  <div>
                    <span
                      className={`text-[12px] font-bold uppercase tracking-[0.14em] ${
                        featured ? "text-[#3525cd]" : "text-[#64748b]"
                      }`}
                    >
                      {plan.tier}
                    </span>
                    <h3 className="mt-1 text-[24px] font-semibold leading-[32px] text-[#0f172a]">{plan.name}</h3>
                    <p className="mt-1 text-[14px] leading-[20px] text-[#464555]">{plan.desc}</p>
                    <div className="my-6">
                      <div className="flex items-baseline gap-1">
                        <span
                          className={`font-extrabold tabular-nums text-[#0f172a] ${
                            featured ? "text-[48px] leading-[56px] tracking-[-0.02em]" : "text-[24px] leading-[32px]"
                          }`}
                        >
                          {priceLabel}
                        </span>
                        {priceSuffix && <span className="text-[16px] text-[#464555]">{priceSuffix}</span>}
                      </div>
                      <span
                        className={`text-[11px] ${featured ? "font-semibold text-[#3525cd]" : "text-[#64748b]"}`}
                      >
                        {priceNote}
                      </span>
                    </div>
                    <PlanFeatures
                      features={plan.features}
                      featured={featured}
                      moreLabel={copy.showMore}
                      lessLabel={copy.showLess}
                    />
                  </div>
                  <div className="mt-8 sm:mt-12">
                    {isContactPlan ? (
                      <SalesContactDialog
                        triggerLabel={plan.cta}
                        triggerClassName="group inline-flex w-full items-center justify-center rounded-lg bg-[#0f172a] py-3 text-[14px] font-semibold text-white transition-all hover:bg-[#3525cd]"
                      >
                        <CascadeText text={plan.cta} />
                      </SalesContactDialog>
                    ) : (
                      <Link
                        href={HIRE}
                        aria-label={plan.cta}
                        className={`group inline-flex w-full items-center justify-center rounded-lg py-3 text-[14px] font-semibold transition-all ${
                          featured
                            ? "bg-[#3525cd] text-white shadow-[0_8px_24px_rgba(53,37,205,0.25)] hover:bg-[#4f46e5]"
                            : "bg-[#eae6f4] text-[#0f172a] hover:bg-[#0f172a] hover:text-white"
                        }`}
                      >
                        <CascadeText text={plan.cta} />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </PlanFeaturesProvider>
      </div>
    </section>
  );
}
