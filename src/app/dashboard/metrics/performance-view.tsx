"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { ChevronRightIcon } from "@/components/ui/icons";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { ConversationsChart, type ChartPoint } from "./conversations-chart";
import { Funnel, type FunnelStep } from "./funnel";
import { RANGE_DAYS } from "./constants";

export type HealthState = "healthy" | "waiting" | "paused";

export type PerformanceViewProps = {
  rangeValue: string;
  rangeDays: number;
  granularity: "day" | "week";
  agentOptions: { value: string; label: string }[];
  selectedAgent: string;
  labels: {
    range: Record<string, string>;
    rangeGroup: string;
    agentGroup: string;
    conversations: string;
    funnelTitle: string;
    funnelBody: string;
    notASale: string | null;
  };
  health: { state: HealthState; title: string };
  conversations: {
    total: number;
    previousTotal: number | null;
    messages: number;
  };
  points: ChartPoint[];
  funnel: FunnelStep[];
  outcomes: { key: string; label: string; value: number }[];
  reliability: {
    title: string;
    subtitle: string;
    emptyBody: string;
    scopeNote: string;
    hasActivity: boolean;
    stats: { key: string; value: number; label: string; emphasis?: boolean }[];
    cta?: { href: string; label: string };
  };
};

function RangeSwitch({
  value,
  labels,
  groupLabel,
  disabled,
  onChange,
}: {
  value: string;
  labels: Record<string, string>;
  groupLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { indicatorRef, register } = useSlidingIndicator<HTMLButtonElement>(value, null, "x");
  return (
    <div role="group" aria-label={groupLabel} className="relative inline-flex rounded-full bg-surface-container p-1">
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className="inbox-indicator absolute left-0 rounded-full bg-surface-container-lowest opacity-0 shadow-[0_1px_3px_rgba(25,28,29,0.14)]"
      />
      {RANGE_DAYS.map((days) => (
        <button
          key={days}
          ref={register(days)}
          type="button"
          aria-pressed={value === days}
          disabled={disabled}
          onClick={() => onChange(days)}
          className={clsx(
            "relative z-10 inline-flex h-8 items-center whitespace-nowrap rounded-full px-3.5 text-label-md font-semibold transition-colors duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed",
            value === days ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface",
          )}
        >
          {labels[days]}
        </button>
      ))}
    </div>
  );
}

const HEALTH_DOT: Record<HealthState, string> = {
  healthy: "inbox-live-dot bg-success-500",
  waiting: "bg-primary",
  paused: "bg-outline",
};

export function PerformanceView(props: PerformanceViewProps) {
  const t = useTranslations("Metrics.view");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const numberFmt = new Intl.NumberFormat(locale);

  function navigate(key: "days" | "agent", value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  const { total, previousTotal, messages } = props.conversations;
  const delta =
    previousTotal === null || previousTotal === 0 ? null : Math.round(((total - previousTotal) / previousTotal) * 100);
  const deltaText =
    previousTotal === null || previousTotal === 0
      ? t("noPrevious", { days: props.rangeDays })
      : delta! > 200
        ? t("deltaFrom", {
            previous: numberFmt.format(previousTotal),
            days: props.rangeDays,
          })
        : delta === 0
          ? t("deltaFlat", { days: props.rangeDays })
          : delta! > 0
            ? t("deltaUp", { pct: delta!, days: props.rangeDays })
            : t("deltaDown", { pct: Math.abs(delta!), days: props.rangeDays });

  const dim = clsx(
    "transition-[opacity,filter] duration-300",
    isPending && "pointer-events-none opacity-50 saturate-[0.6]",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {props.agentOptions.length > 1 ? (
          <label className="relative inline-flex">
            <span className="sr-only">{props.labels.agentGroup}</span>
            <select
              value={props.selectedAgent}
              disabled={isPending}
              onChange={(e) => navigate("agent", e.target.value)}
              className="h-10 appearance-none rounded-full border-0 bg-surface-container pl-4 pr-10 text-label-md font-semibold text-on-surface outline-none transition-shadow focus:shadow-[0_0_0_4px_rgba(53,37,205,0.12)] disabled:opacity-60"
            >
              {props.agentOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronRightIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-on-surface-variant" />
          </label>
        ) : null}
        <RangeSwitch
          value={props.rangeValue}
          labels={props.labels.range}
          groupLabel={props.labels.rangeGroup}
          disabled={isPending}
          onChange={(v) => v !== props.rangeValue && navigate("days", v)}
        />
        <span className="inline-flex items-center gap-2 rounded-full bg-surface-container-lowest px-3.5 py-2 text-[13px] font-semibold text-on-surface ring-1 ring-outline-variant/60 sm:ml-auto">
          <span aria-hidden="true" className={clsx("h-2 w-2 rounded-full", HEALTH_DOT[props.health.state])} />
          {props.health.title}
        </span>
      </div>

      <div className="relative h-0.5 overflow-hidden rounded-full">
        {isPending ? (
          <div className="animate-progress-sweep absolute inset-y-0 w-1/4 rounded-full bg-primary/60" />
        ) : null}
      </div>

      <div key={`${props.selectedAgent}-${props.rangeValue}`} className={clsx("flex flex-col gap-6", dim)}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <section className="flex min-w-0 flex-col gap-5 rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-[0_1px_2px_rgba(25,28,29,0.04),0_24px_60px_-32px_rgba(53,37,205,0.25)] sm:p-7">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-on-surface-variant">{props.labels.conversations}</h2>
              <p className="text-[48px] font-semibold leading-none tracking-[-0.03em] text-on-surface">
                {numberFmt.format(total)}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-on-surface-variant">
                <span
                  className={clsx(
                    "font-medium",
                    delta !== null && delta > 0 && "text-success-500",
                    delta !== null && delta < 0 && "text-error",
                  )}
                >
                  {delta !== null && delta !== 0 ? (
                    <ChevronRightIcon
                      aria-hidden="true"
                      className={clsx("mr-1 inline h-3.5 w-3.5 align-[-2px]", delta > 0 ? "-rotate-90" : "rotate-90")}
                    />
                  ) : null}
                  {deltaText}
                </span>
                <span>{t("messages", { count: messages })}</span>
              </p>
            </div>
            {total === 0 && (props.conversations.previousTotal ?? 0) === 0 ? (
              <p className="flex min-h-40 flex-1 items-center justify-center rounded-2xl bg-surface-container-low px-4 py-10 text-center text-sm text-on-surface-variant">
                {t("chartEmpty")}
              </p>
            ) : (
              <ConversationsChart points={props.points} granularity={props.granularity} rangeDays={props.rangeDays} />
            )}
          </section>

          <section className="flex flex-col gap-5 rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-[0_1px_2px_rgba(25,28,29,0.04)] sm:p-7">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-on-surface">{props.labels.funnelTitle}</h2>
              <p className="mt-0.5 text-sm text-on-surface-variant">{props.labels.funnelBody}</p>
            </div>
            <Funnel steps={props.funnel} />
            {props.outcomes.length > 0 ? (
              <div className="border-t border-outline-variant/50 pt-4">
                <h3 className="text-[13px] font-semibold text-on-surface-variant">{t("outcomesTitle")}</h3>
                <dl className="mt-3 grid grid-cols-3 gap-3">
                  {props.outcomes.map((o) => (
                    <div key={o.key}>
                      <dt className="text-[12px] text-on-surface-variant">{o.label}</dt>
                      <dd className="text-lg font-semibold tabular-nums text-on-surface">
                        {numberFmt.format(o.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            {props.labels.notASale ? (
              <p className="mt-auto text-[12px] leading-5 text-on-surface-variant">{props.labels.notASale}</p>
            ) : null}
          </section>
        </div>

        <section className="rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-[0_1px_2px_rgba(25,28,29,0.04)] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
            <div className="max-w-md">
              <h2 className="text-lg font-semibold tracking-tight text-on-surface">{props.reliability.title}</h2>
              <p className="mt-0.5 text-sm text-on-surface-variant">{props.reliability.subtitle}</p>
            </div>
            {props.reliability.hasActivity ? (
              <dl className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-outline-variant/50 lg:max-w-2xl">
                {props.reliability.stats.map((s) => (
                  <div key={s.key} className="flex flex-col-reverse justify-end sm:px-6 sm:first:pl-0 sm:last:pr-0">
                    <dt className="mt-0.5 text-[13px] text-on-surface-variant">{s.label}</dt>
                    <dd className="text-2xl font-semibold tabular-nums text-on-surface">{numberFmt.format(s.value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="max-w-md text-sm text-on-surface-variant">{props.reliability.emptyBody}</p>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-outline-variant/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] leading-5 text-on-surface-variant">{props.reliability.scopeNote}</p>
            {props.reliability.cta ? (
              <Link
                href={props.reliability.cta.href}
                className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                {props.reliability.cta.label}
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
