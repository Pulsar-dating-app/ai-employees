"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { getSelfServePlansForVariant } from "@/lib/billing/plans";
import { CheckIcon, UsersIcon, XIcon } from "@/components/ui/icons";
import { SalesContactDialog } from "./sales-contact-dialog";
import { CascadeText } from "./cascade-text";
import maluImg from "../../../public/agents/sales-1.png";
import anaImg from "../../../public/agents/secretary-1.png";

const WEEK_HOURS = 168;
const CLT_WEEK_HOURS = 44;
const REPLIES_PER_CONVERSATION = 5;
const VOLUME_STEP = 50;
const VOLUME_MIN = 50;
const VOLUME_MAX = 1500;
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("pt-BR");

type Row = { label: string; person: string; staffra: string };
type PlanCopy = { name: string };

function HoursCell({ hours, highlight }: { hours: number; highlight?: boolean }) {
  const t = useTranslations("LandingV2.value.compare");
  return (
    <div className="flex flex-col gap-2">
      <p
        className={clsx(
          "text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums",
          highlight ? "text-[#3525cd]" : "text-[#64748b]",
        )}
      >
        {t("hours", { hours })}
      </p>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[#e7e3f7]">
        <div
          className={clsx(
            "billing-bar-in h-full origin-left rounded-full",
            highlight ? "bg-[#3525cd]" : "bg-[#a8a3c7]",
          )}
          style={{ width: `${(hours / WEEK_HOURS) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Comparison() {
  const t = useTranslations("LandingV2.value.compare");
  const rows = t.raw("rows") as Row[];
  return (
    <div className="flex flex-col rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-[#e7e3f7] sm:p-7">
      <h3 className="text-[18px] font-semibold text-[#0f172a]">{t("title")}</h3>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
        <div className="flex items-center gap-2.5 rounded-2xl bg-[#f4f4f7] p-3">
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#64748b] sm:flex">
            <UsersIcon className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold leading-5 text-[#0f172a]">{t("personHead")}</span>
            <span className="block text-[12px] leading-4 text-[#64748b]">{t("personSub")}</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5 rounded-2xl bg-[#3525cd] p-3 text-white">
          <span className="hidden shrink-0 -space-x-2 sm:flex">
            {[maluImg, anaImg].map((img, i) => (
              <Image
                key={i}
                src={img}
                alt=""
                sizes="36px"
                className="h-9 w-9 rounded-full bg-white object-cover object-top ring-2 ring-[#3525cd]"
              />
            ))}
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold leading-5">{t("staffraHead")}</span>
            <span className="block text-[12px] leading-4 text-[#dad7ff]">{t("staffraSub")}</span>
          </span>
        </div>
      </div>

      <dl className="mt-2 flex flex-col">
        <div className="border-b border-[#efecf8] py-4">
          <dt className="mb-3 text-[13px] font-medium text-[#464555]">{t("hoursLabel")}</dt>
          <dd className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="px-3 py-2.5">
              <HoursCell hours={CLT_WEEK_HOURS} />
            </div>
            <div className="rounded-xl bg-[#f5f2ff] px-3 py-2.5">
              <HoursCell hours={WEEK_HOURS} highlight />
            </div>
          </dd>
        </div>
        {rows.map((row) => (
          <div key={row.label} className="border-b border-[#efecf8] py-3.5 last:border-b-0">
            <dt className="mb-2 text-[13px] font-medium text-[#464555]">{row.label}</dt>
            <dd className="grid grid-cols-2 gap-2 sm:gap-3">
              <span className="flex items-start gap-2 px-3 py-2 text-[14px] leading-5 text-[#64748b]">
                <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#b4b0c8]" />
                {row.person}
              </span>
              <span className="flex items-start gap-2 rounded-xl bg-[#f5f2ff] px-3 py-2 text-[14px] font-semibold leading-5 text-[#0f172a]">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#10b981]" />
                {row.staffra}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[12px] leading-5 text-[#64748b]">{t("note")}</p>
    </div>
  );
}

function Stepper({
  id,
  value,
  onChange,
  decreaseLabel,
  increaseLabel,
}: {
  id: string;
  value: number;
  onChange: (next: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  const clamp = (n: number) => Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, n));
  const buttonClass =
    "flex h-full w-11 items-center justify-center rounded-[9px] text-[20px] text-[#464555] transition-colors hover:text-[#3525cd] focus-visible:!outline-none focus-visible:bg-[#f5f2ff] focus-visible:text-[#3525cd] focus-visible:shadow-[inset_0_0_0_2px_#3525cd] disabled:opacity-30";
  return (
    <div className="flex h-12 items-center rounded-xl border border-[#d8d4ee] bg-white p-0.5 transition-[border-color,box-shadow] has-[input:focus]:border-[#3525cd] has-[input:focus]:shadow-[0_0_0_4px_rgba(53,37,205,0.12)]">
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={value <= VOLUME_MIN}
        onClick={() => onChange(clamp(value - VOLUME_STEP))}
        className={buttonClass}
      >
        −
      </button>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={NUM.format(value)}
        onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, "")) || VOLUME_MIN))}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-[16px] font-semibold tabular-nums text-[#0f172a] outline-none focus-visible:!outline-none"
      />
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={value >= VOLUME_MAX}
        onClick={() => onChange(clamp(value + VOLUME_STEP))}
        className={buttonClass}
      >
        +
      </button>
    </div>
  );
}

function ValueCalculator() {
  const t = useTranslations("LandingV2.value.calc");
  const tPricing = useTranslations("LandingV2.pricing");
  const planCopy = tPricing.raw("plans") as PlanCopy[];
  const costId = useId();
  const volumeId = useId();
  const [costText, setCostText] = useState("");
  const [conversations, setConversations] = useState(150);
  const [whatsapp, setWhatsapp] = useState(true);

  const plans = getSelfServePlansForVariant("monthly", whatsapp);
  const neededReplies = conversations * REPLIES_PER_CONVERSATION;
  const planIndex = plans.findIndex((p) => (p.monthlyReplyLimit ?? 0) >= neededReplies);
  const plan = planIndex >= 0 ? plans[planIndex] : null;
  const planPrice = (plan?.priceBrlCents ?? 0) / 100;
  const planReplies = plan?.monthlyReplyLimit ?? 0;
  const usagePct = plan ? Math.max(1, Math.round((neededReplies / planReplies) * 100)) : 0;
  const cost = Number(costText.replace(/\D/g, "")) || 0;
  const diff = cost - planPrice;

  return (
    <div className="flex flex-col gap-6 rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_60px_-32px_rgba(53,37,205,0.35)] ring-1 ring-[#e7e3f7] sm:p-7">
      <div>
        <h3 className="text-[18px] font-semibold text-[#0f172a]">{t("title")}</h3>
        <p className="mt-1 text-[14px] leading-6 text-[#464555]">{t("sub")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={costId} className="text-[14px] font-semibold text-[#0f172a]">
          {t("costLabel")}
        </label>
        <div className="flex h-12 items-center rounded-xl border border-[#d8d4ee] bg-white transition-[border-color,box-shadow] focus-within:border-[#3525cd] focus-within:shadow-[0_0_0_4px_rgba(53,37,205,0.12)]">
          <span className="pl-4 text-[15px] text-[#64748b]">R$</span>
          <input
            id={costId}
            inputMode="numeric"
            autoComplete="off"
            placeholder={t("costPlaceholder")}
            value={costText}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
              setCostText(digits ? NUM.format(Number(digits)) : "");
            }}
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-[16px] font-semibold tabular-nums text-[#0f172a] outline-none placeholder:font-normal placeholder:text-[#a0a0b8] focus-visible:!outline-none"
          />
        </div>
        <p className="text-[12px] text-[#64748b]">{t("costHint")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={volumeId} className="text-[14px] font-semibold text-[#0f172a]">
          {t("volumeLabel")}
        </label>
        <Stepper
          id={volumeId}
          value={conversations}
          onChange={setConversations}
          decreaseLabel={t("decrease")}
          increaseLabel={t("increase")}
        />
        <input
          type="range"
          aria-label={t("volumeLabel")}
          min={VOLUME_MIN}
          max={VOLUME_MAX}
          step={VOLUME_STEP}
          value={conversations}
          onChange={(e) => setConversations(Number(e.target.value))}
          className="mt-2 h-2 w-full cursor-pointer accent-[#3525cd] focus-visible:!rounded-full focus-visible:!outline-offset-4"
        />
        <p className="text-[12px] text-[#64748b]">{t("volumeHint", { replies: REPLIES_PER_CONVERSATION })}</p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-[#faf9fe] px-4 py-3 ring-1 ring-[#efecf8]">
        <span id={`${volumeId}-wpp`} className="text-[14px] font-semibold text-[#0f172a]">
          {t("wppLabel")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={whatsapp}
          aria-labelledby={`${volumeId}-wpp`}
          onClick={() => setWhatsapp((v) => !v)}
          className={clsx(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200",
            whatsapp ? "bg-[#3525cd]" : "bg-[#d8d4ee]",
          )}
        >
          <span
            className={clsx(
              "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              whatsapp ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        {plan ? (
          <div className="rounded-2xl bg-[#3525cd] p-5 text-white">
            <p className="text-[13px] font-medium text-[#dad7ff]">{t("resultLabel")}</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-[22px] font-semibold leading-tight">{planCopy[planIndex]?.name}</p>
              <p className="text-[22px] font-semibold tabular-nums leading-tight">
                {t("perMonth", { price: BRL.format(planPrice) })}
              </p>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-[#dad7ff]">
              {t(whatsapp ? "planFitsWpp" : "planFits", {
                replies: NUM.format(planReplies),
                conversations: NUM.format(Math.floor(planReplies / REPLIES_PER_CONVERSATION)),
              })}
            </p>
            <div className="mt-4">
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              <p className="mt-2 text-[12px] text-[#dad7ff]">{t("usage", { pct: usagePct })}</p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-[#0f172a] p-5 text-white">
            <p className="text-[13px] font-medium text-[#cbd5e1]">{t("resultLabel")}</p>
            <p className="mt-1 text-[22px] font-semibold leading-tight">{planCopy[planCopy.length - 1]?.name}</p>
            <p className="mt-2 text-[13px] leading-5 text-[#cbd5e1]">{t("customBody")}</p>
            <SalesContactDialog
              triggerLabel={t("customCta")}
              triggerClassName="group mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-[14px] font-semibold text-[#0f172a] transition-colors hover:bg-[#e2dfff]"
            >
              <CascadeText text={t("customCta")} />
            </SalesContactDialog>
          </div>
        )}

        {plan ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#f4f4f7] p-4">
                <p className="text-[13px] font-medium text-[#64748b]">{t("today")}</p>
                <p className="mt-1 text-[22px] font-semibold tabular-nums leading-tight text-[#0f172a]">
                  {cost > 0 ? BRL.format(cost) : "—"}
                </p>
                <p className="mt-1 text-[12px] text-[#64748b]">{t("todaySub")}</p>
              </div>
              <div className="rounded-2xl bg-[#f5f2ff] p-4 ring-1 ring-[#dcd7fb]">
                <p className="text-[13px] font-medium text-[#3525cd]">{t("withStaffra")}</p>
                <p className="mt-1 text-[22px] font-semibold tabular-nums leading-tight text-[#0f172a]">
                  {BRL.format(planPrice)}
                </p>
                <p className="mt-1 text-[12px] text-[#464555]">{t("withStaffraSub")}</p>
              </div>
            </div>
            <p className="text-[15px] font-semibold leading-6">
              {cost <= 0 ? (
                <span className="font-normal text-[#64748b]">{t("empty")}</span>
              ) : diff > 0 ? (
                <span className="text-[#047857]">{t("saving", { amount: BRL.format(diff) })}</span>
              ) : (
                <span className="text-[#0f172a]">{t("extra", { amount: BRL.format(-diff) })}</span>
              )}
            </p>
          </>
        ) : null}
        <p className="text-[12px] leading-5 text-[#64748b]">{t("disclaimer")}</p>
      </div>
    </div>
  );
}

export function ValueSection() {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <Comparison />
      <ValueCalculator />
    </div>
  );
}
