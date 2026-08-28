"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  BarChartIcon,
  CartIcon,
  ChatIcon,
  LightbulbIcon,
  TargetIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { MetricCard } from "./metric-card";
import { AgentHealthCard, type HealthState } from "./agent-health-card";
import { RangeToggle } from "./range-toggle";

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

const METRIC_ICON: Record<string, IconComponent> = {
  conversations: ChatIcon,
  customers: UsersIcon,
  product_recommendations: LightbulbIcon,
  buying_intent: TargetIcon,
  checkout_clicks: CartIcon,
};

const METRIC_SIZE: Record<string, "lg" | "md"> = {
  conversations: "lg",
  customers: "lg",
  product_recommendations: "md",
  buying_intent: "md",
  checkout_clicks: "md",
};

export type MetricCardData = {
  key: string;
  label: string;
  caption: string;
  value: string;
  series: number[];
};

export type MetricsClientProps = {
  rangeValue: string;
  header: { title: string; subtitle: string };
  overview: { title: string; subtitle: string };
  rangeLabels: Record<string, string>;
  rangeGroupLabel: string;
  cards: MetricCardData[];
  notASale: string;
  health: {
    state: HealthState;
    title: string;
    body: string;
    cta?: { href: string; label: string };
  };
};

// Owns the interactive shell: the period toggle drives a router transition,
// and while it's pending the numbers dim + blur under an indeterminate
// sweep. New data remounts the grid (keyed by range) so every sparkline
// redraws itself left-to-right.
export function MetricsClient({
  rangeValue,
  header,
  overview,
  rangeLabels,
  rangeGroupLabel,
  cards,
  notASale,
  health,
}: MetricsClientProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function changeRange(days: string) {
    if (days === rangeValue) return;
    const params = new URLSearchParams(searchParams);
    params.set("days", days);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  const dim = clsx(
    "transition-[opacity,filter] duration-300",
    isPending && "pointer-events-none opacity-40 blur-[1px] saturate-[0.6]",
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={BarChartIcon}
        title={header.title}
        subtitle={header.subtitle}
        action={
          <RangeToggle
            value={rangeValue}
            labels={rangeLabels}
            groupLabel={rangeGroupLabel}
            onChange={changeRange}
            busy={isPending}
          />
        }
      />

      <div className="relative flex flex-col gap-6">
        <div
          aria-hidden
          className={clsx(
            "pointer-events-none absolute -top-3 left-0 right-0 h-0.5 overflow-hidden rounded-full transition-opacity duration-200",
            isPending ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="animate-metrics-sweep h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
        </div>

        <div>
          <h2 className="text-headline-md font-semibold tracking-tight text-on-surface">
            {overview.title}
          </h2>
          <p className="mt-1 text-body-md text-on-surface-variant">{overview.subtitle}</p>
        </div>

        <div
          key={rangeValue}
          aria-busy={isPending}
          className={clsx("grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-6", dim)}
        >
          {cards.map((card) => (
            <MetricCard
              key={card.key}
              icon={METRIC_ICON[card.key]}
              label={card.label}
              caption={card.caption}
              value={card.value}
              series={card.series}
              size={METRIC_SIZE[card.key]}
              className={METRIC_SIZE[card.key] === "lg" ? "lg:col-span-3" : "lg:col-span-2"}
            />
          ))}
        </div>

        <p className={clsx("text-sm text-on-surface-variant", dim)}>{notASale}</p>
      </div>

      <div className={dim}>
        <AgentHealthCard
          state={health.state}
          title={health.title}
          body={health.body}
          cta={health.cta}
        />
      </div>
    </div>
  );
}
