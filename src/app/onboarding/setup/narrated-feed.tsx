"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { CheckIcon, SpinnerIcon } from "@/components/ui/icons";

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

  return (
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
                  <CheckIcon className="h-4 w-4 text-tertiary" />
                ) : (
                  <SpinnerIcon className="h-3.5 w-3.5 text-primary" />
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
  );
}
