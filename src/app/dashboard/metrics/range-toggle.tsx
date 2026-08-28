"use client";

import clsx from "clsx";
import { RANGE_DAYS } from "./constants";

// A segmented control for the period — cleaner in a page header than a
// dropdown. Dumb/presentational: <MetricsClient> owns the transition.
export function RangeToggle({
  value,
  labels,
  onChange,
  busy = false,
  groupLabel,
}: {
  value: string;
  labels: Record<string, string>;
  onChange: (days: string) => void;
  busy?: boolean;
  groupLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={groupLabel}
      className={clsx(
        "inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1 transition-opacity",
        busy && "opacity-70",
      )}
    >
      {RANGE_DAYS.map((days) => {
        const isActive = value === days;
        return (
          <button
            key={days}
            type="button"
            aria-pressed={isActive}
            disabled={busy}
            onClick={() => onChange(days)}
            className={clsx(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed",
              isActive
                ? "bg-surface-container-lowest text-on-surface shadow-level1"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            {labels[days]}
          </button>
        );
      })}
    </div>
  );
}
