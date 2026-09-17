"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { CheckIcon } from "@/components/ui/icons";
import { OnboardingLoader } from "../onboarding-loader";

export type FeedLine = {
  id: string;
  text: string;
  detail?: string;
  state: "running" | "done";
};

// The waiting time is the point, not the cost: each line lands as its work
// finishes, so the merchant watches their own business being recognised
// instead of watching a spinner. Lines are appended, never replaced.
export function NarratedFeed({ lines }: { lines: FeedLine[] }) {
  // The region mounts empty and fills on the next frame. A live region that
  // arrives with its content already inside announces nothing, so without this
  // the first lines -- the ones that carry the payoff -- would be silent.
  const [live, setLive] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setLive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // The panel itself breathes while any line is still running -- the wait
  // during an import or a services save reads as her doing something,
  // instead of the only feedback being each line's own small spinner.
  const working = lines.some((line) => line.state === "running");

  return (
    <div
      className={clsx(
        "rounded-lg border border-transparent bg-white/70 p-5 transition-colors duration-500",
        working && "onboarding-working",
      )}
    >
      <ol aria-live="polite" aria-relevant="additions" className="flex flex-col gap-2.5">
        {live
          ? lines.map((line) => (
              <li
                key={line.id}
                className="animate-fade-up flex items-baseline gap-2.5 text-body-md text-on-surface"
              >
                <span
                  aria-hidden
                  className="relative top-0.5 flex h-4 w-4 shrink-0 items-center justify-center"
                >
                  {line.state === "done" ? (
                    <CheckIcon className="animate-onboarding-check-pop h-4 w-4 text-tertiary" />
                  ) : (
                    <OnboardingLoader className="text-primary" />
                  )}
                </span>
                <span className={clsx(line.state === "running" && "text-on-surface-variant")}>
                  {line.text}
                  {line.detail ? (
                    <span className="ml-1.5 font-mono text-label-sm text-on-surface-variant">
                      {line.detail}
                    </span>
                  ) : null}
                </span>
              </li>
            ))
          : null}
      </ol>
    </div>
  );
}
