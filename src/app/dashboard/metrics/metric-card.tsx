import clsx from "clsx";
import { Sparkline } from "@/components/ui/sparkline";

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

// One bento cell on the metrics page. `size="lg"` is the emphasised top row
// (Conversations / Customers) with a display-size number; `size="md"` is the
// three event metrics below it.
export function MetricCard({
  icon: Icon,
  label,
  caption,
  value,
  series,
  size = "md",
  className,
}: {
  icon: IconComponent;
  label: string;
  caption: string;
  value: string;
  series: number[];
  size?: "lg" | "md";
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "relative flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-level1",
        size === "lg" ? "min-h-44" : "min-h-36",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-on-surface-variant">
        <Icon className="h-4 w-4 text-primary-container" />
        <h3 className="text-xs font-semibold uppercase tracking-wider">{label}</h3>
      </div>

      <div className="relative z-10 mt-3 flex flex-col">
        <span
          className={clsx(
            "font-semibold tracking-tight text-on-surface",
            size === "lg" ? "text-display-lg" : "text-headline-lg",
          )}
        >
          {value}
        </span>
        <span className="mt-1 text-sm text-on-surface-variant">{caption}</span>
      </div>

      <div
        className={clsx(
          "pointer-events-none absolute inset-x-0 bottom-0 text-primary-container opacity-50",
          size === "lg" ? "h-20" : "h-14",
        )}
      >
        <Sparkline points={series} className="h-full w-full" />
      </div>
    </div>
  );
}
