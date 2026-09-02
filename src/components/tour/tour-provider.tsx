"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { TourOverlay } from "./tour-overlay";
import type { TourStep } from "./types";

type TourContextValue = {
  /** Starts a new tour, replacing any tour already running. No-op on an
   * empty step list — there'd be nothing to show. */
  start: (steps: TourStep[]) => void;
  /** Ends the active tour, if any. Safe to call with none running. */
  end: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

// App-wide spotlight tour system. Mount <TourProvider> once, high in the
// tree (this app's dashboard layout) -- then any component below it calls
// useTour().start([...]) to walk a visitor through a sequence of on-screen
// elements: a dimmed backdrop, a spotlight cut out around the current
// step's element, and a balloon (title + description + step counter +
// back/next) pointing at it. See TourStep's own comment for how a step
// names its target element.
//
// Single active tour at a time, by design -- starting a new one replaces
// whatever was running rather than stacking. Nothing in this app runs two
// onboarding flows at once, and a stack would need its own "which one wins"
// rule this codebase doesn't need yet.
export function TourProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);

  const start = useCallback((nextSteps: TourStep[]) => {
    if (nextSteps.length === 0) return;
    setSteps(nextSteps);
    setIndex(0);
  }, []);

  const end = useCallback(() => {
    setSteps(null);
    setIndex(0);
  }, []);

  const back = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      // Stops one short of the end deliberately -- the overlay swaps its
      // "Next" button for "Done" on the last step and calls `end` directly
      // instead of `next`, so this branch is a safety net, not the normal path.
      if (!steps || i + 1 >= steps.length) return i;
      return i + 1;
    });
  }, [steps]);

  const value = useMemo(() => ({ start, end }), [start, end]);
  const activeStep = steps?.[index] ?? null;

  return (
    <TourContext.Provider value={value}>
      {children}
      {steps && activeStep ? (
        <TourOverlay
          step={activeStep}
          stepIndex={index}
          totalSteps={steps.length}
          onNext={index === steps.length - 1 ? end : next}
          onBack={index > 0 ? back : undefined}
          onEnd={end}
          isLastStep={index === steps.length - 1}
        />
      ) : null}
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}
