"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { M } from "./landing-icons";

const WEEK_HOURS = 168;
const CLT_WEEK_HOURS = 44;
const MAX_COUNT = 10;
const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

type Fact = { label: string; staffra: string; person: string };

function CoverageBar({ label, hours, highlight }: { label: string; hours: number; highlight?: boolean }) {
  const t = useTranslations("LandingV2.value.coverage");
  const pct = Math.min(100, (hours / WEEK_HOURS) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className={clsx("text-[15px]", highlight ? "font-semibold text-[#0f172a]" : "text-[#464555]")}>
          {label}
        </span>
        <span
          className={clsx(
            "shrink-0 whitespace-nowrap text-[15px] font-semibold tabular-nums",
            highlight ? "text-[#3525cd]" : "text-[#64748b]",
          )}
        >
          {t("hours", { hours })}
        </span>
      </div>
      <div aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-[#eae6f4]">
        <div
          className={clsx(
            "billing-bar-in h-full origin-left rounded-full",
            highlight ? "bg-[#3525cd]" : "bg-[#a8a3c7]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ValueCalculator({
  planPriceCents,
  planReplies,
  planName,
}: {
  planPriceCents: number;
  planReplies: number;
  planName: string;
}) {
  const t = useTranslations("LandingV2.value");
  const facts = t.raw("facts") as Fact[];
  const costId = useId();
  const countId = useId();
  const [costText, setCostText] = useState("");
  const [count, setCount] = useState(1);

  const cost = Number(costText.replace(/\D/g, "")) || 0;
  const today = cost * count;
  const plan = planPriceCents / 100;
  const coveredHours = Math.min(WEEK_HOURS, CLT_WEEK_HOURS * count);
  const saving = today - plan;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6 rounded-[24px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-[#e7e3f7] sm:p-8">
        <div>
          <h3 className="text-[18px] font-semibold text-[#0f172a]">{t("coverage.title")}</h3>
          <p className="mt-1 text-[14px] leading-6 text-[#464555]">{t("coverage.note")}</p>
        </div>
        <CoverageBar label={t("coverage.person")} hours={CLT_WEEK_HOURS} />
        <CoverageBar label={t("coverage.staffra")} hours={WEEK_HOURS} highlight />
        <div className="mt-2 flex flex-col">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 pb-2 text-right text-[12px] font-semibold text-[#64748b]">
            <span className="col-start-2">
              <span className="text-[#3525cd]">{t("factsHeader.staffra")}</span>
              {" · "}
              {t("factsHeader.person")}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-[#efecf8] border-t border-[#efecf8]">
            {facts.map((fact) => (
              <li key={fact.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-0.5 py-3">
                <span className="text-[14px] text-[#464555]">{fact.label}</span>
                <span className="flex items-center gap-1.5 text-right text-[14px] font-semibold text-[#0f172a]">
                  <M name="check_circle" size={16} className="shrink-0 text-[#10b981]" />
                  {fact.staffra}
                </span>
                <span className="col-start-2 text-right text-[13px] text-[#64748b]">{fact.person}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-6 rounded-[24px] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_60px_-32px_rgba(53,37,205,0.35)] ring-1 ring-[#e7e3f7] sm:p-8">
        <div>
          <h3 className="text-[18px] font-semibold text-[#0f172a]">{t("calc.title")}</h3>
          <p className="mt-1 text-[14px] leading-6 text-[#464555]">{t("calc.sub")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={costId} className="text-[14px] font-semibold text-[#0f172a]">
              {t("calc.costLabel")}
            </label>
            <div className="flex h-12 items-center rounded-xl border border-[#d8d4ee] bg-white transition-[border-color,box-shadow] focus-within:border-[#3525cd] focus-within:shadow-[0_0_0_4px_rgba(53,37,205,0.12)]">
              <span className="pl-4 text-[15px] text-[#64748b]">R$</span>
              <input
                id={costId}
                inputMode="numeric"
                autoComplete="off"
                placeholder={t("calc.costPlaceholder")}
                value={costText}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
                  setCostText(digits ? new Intl.NumberFormat("pt-BR").format(Number(digits)) : "");
                }}
                className="h-full min-w-0 flex-1 bg-transparent px-2 text-[16px] font-semibold tabular-nums text-[#0f172a] outline-none placeholder:font-normal placeholder:text-[#a0a0b8]"
              />
            </div>
            <p className="text-[12px] text-[#64748b]">{t("calc.costHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={countId} className="text-[14px] font-semibold text-[#0f172a]">
              {t("calc.countLabel")}
            </label>
            <div className="flex h-12 items-center rounded-xl border border-[#d8d4ee] bg-white">
              <button
                type="button"
                aria-label={t("calc.decrease")}
                disabled={count <= 1}
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                className="flex h-full w-11 items-center justify-center text-[20px] text-[#464555] transition-colors hover:text-[#3525cd] disabled:opacity-30"
              >
                −
              </button>
              <input
                id={countId}
                inputMode="numeric"
                value={count}
                onChange={(e) =>
                  setCount(Math.min(MAX_COUNT, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))
                }
                className="h-full w-10 bg-transparent text-center text-[16px] font-semibold tabular-nums text-[#0f172a] outline-none"
              />
              <button
                type="button"
                aria-label={t("calc.increase")}
                disabled={count >= MAX_COUNT}
                onClick={() => setCount((c) => Math.min(MAX_COUNT, c + 1))}
                className="flex h-full w-11 items-center justify-center text-[20px] text-[#464555] transition-colors hover:text-[#3525cd] disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3" aria-live="polite">
          <div className="rounded-2xl bg-[#f5f2ff] p-4">
            <p className="text-[13px] font-medium text-[#64748b]">{t("calc.today")}</p>
            <p className="mt-1 text-[24px] font-semibold tabular-nums leading-tight text-[#0f172a]">
              {cost > 0 ? BRL.format(today) : "—"}
            </p>
            <p className="mt-1 text-[12px] text-[#64748b]">{t("calc.todayHours", { hours: coveredHours })}</p>
          </div>
          <div className="rounded-2xl bg-[#3525cd] p-4 text-white">
            <p className="text-[13px] font-medium text-[#dad7ff]">{t("calc.withStaffra")}</p>
            <p className="mt-1 text-[24px] font-semibold tabular-nums leading-tight">{BRL.format(plan)}</p>
            <p className="mt-1 text-[12px] text-[#dad7ff]">{t("calc.withStaffraHours", { plan: planName })}</p>
            <p className="mt-0.5 text-[12px] text-[#dad7ff]">
              {t("calc.withStaffraReplies", {
                replies: new Intl.NumberFormat("pt-BR").format(planReplies),
              })}
            </p>
          </div>
        </div>

        <p className="min-h-[24px] text-[15px] font-semibold text-[#0f172a]">
          {cost <= 0 ? (
            <span className="font-normal text-[#64748b]">{t("calc.empty")}</span>
          ) : saving > 0 ? (
            <span className="text-[#047857]">{t("calc.saving", { amount: BRL.format(saving) })}</span>
          ) : (
            t("calc.noSaving")
          )}
        </p>
        <p className="-mt-3 text-[12px] leading-5 text-[#64748b]">{t("calc.disclaimer")}</p>
      </div>
    </div>
  );
}
