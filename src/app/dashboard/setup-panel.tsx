"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { ArrowRightIcon, CheckIcon, ChevronRightIcon } from "@/components/ui/icons";
import { useSetupSteps } from "./setup-steps-context";

// The getting-started list, open on the home page instead of behind the
// sidebar entry: the merchant lands here after onboarding, and every step
// they still owe should be readable without a click. The next one gets the
// only filled button. Hidden once every step is done.
//
// `channelHandled`: the home page's GoLiveCard already leads with the channel
// step, so it isn't offered here as "next" a second time, and the panel steps
// aside entirely when it's the only one left.
export function SetupPanel({ channelHandled = false }: { channelHandled?: boolean }) {
  const t = useTranslations("Dashboard.setup");
  const steps = useSetupSteps();
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  if (total === 0 || done === total) return null;
  const next = steps.find((s) => !s.done && !(channelHandled && s.key === "channel"));
  if (!next) return null;
  const remaining = total - done;

  return (
    <section
      aria-labelledby="setup-panel-title"
      className="flex flex-col gap-5 rounded-3xl border border-primary/25 bg-surface-container-lowest p-5 shadow-[0_18px_40px_-24px_rgba(53,37,205,0.45)] sm:p-7"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="setup-panel-title" className="text-headline-md font-semibold tracking-tight text-on-surface">
            {t("panelTitle")}
          </h2>
          <span className="text-sm font-semibold tabular-nums text-primary">{t("progress", { done, total })}</span>
        </div>
        <p className="text-body-md text-on-surface-variant">{t("panelSubtitle", { remaining })}</p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={t("progress", { done, total })}
          className="h-2 overflow-hidden rounded-full bg-primary-fixed"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl bg-primary-fixed/45 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-primary">
            {steps.indexOf(next) + 1}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-label-sm font-semibold uppercase tracking-[0.08em] text-primary">{t("nextLabel")}</span>
            <span className="text-body-lg font-semibold text-on-surface">{t(`steps.${next.key}.title`)}</span>
            <span className="text-sm text-on-surface-variant">{t(`steps.${next.key}.body`)}</span>
          </span>
        </div>
        <Link
          href={next.href}
          className="group inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-label-md font-semibold text-on-primary shadow-[0_8px_20px_-10px_rgba(53,37,205,0.7)] transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t("doNow")}
          <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((step, i) =>
          step === next ? null : (
            <li key={step.key}>
              <Link
                href={step.href}
                className="group flex items-center gap-3 rounded-xl border border-outline-variant/60 px-3.5 py-3 transition-colors hover:border-primary/30 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span
                  className={clsx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                    step.done ? "bg-success-100 text-success-500" : "bg-surface-container text-on-surface-variant",
                  )}
                >
                  {step.done ? <CheckIcon className="h-3 w-3" /> : i + 1}
                </span>
                <span
                  className={clsx(
                    "min-w-0 flex-1 text-sm font-medium",
                    step.done ? "text-on-surface-variant line-through decoration-outline/60" : "text-on-surface",
                  )}
                >
                  {t(`steps.${step.key}.title`)}
                  {step.done ? <span className="sr-only"> · {t("doneLabel")}</span> : null}
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-outline transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
