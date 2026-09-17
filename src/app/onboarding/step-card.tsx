import { ViewTransition } from "react";
import Image from "next/image";
import clsx from "clsx";

// One card shape for all four steps, inherited from the Stitch "Setup
// Business" screen this route already shipped: frosted white on the indigo
// ground, hairline indigo-tinted border, soft ambient lift.
//
// Every step page mounts a fresh instance of this (a different route
// segment, not the same component persisting), so advancing a step really
// does unmount the old card and mount a new one -- exactly what
// ViewTransition needs to fire. The outgoing card dissolves out through the
// "onboarding-card-swap" browser-level transition (globals.css); the
// incoming one plays its own animate-onboarding-step-in entrance on the
// live element underneath, rather than the two cutting between each other.
// `default="none"` keeps this scoped to that one swap -- an unrelated
// transition on the same route (the locale toggle's router.refresh()) never
// remounts this component, so it never replays either animation anyway,
// but `default="none"` is the belt-and-suspenders that keeps it that way.
export function StepCard({
  title,
  subtitle,
  portrait,
  portraitAlt,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  portrait?: string | null;
  portraitAlt?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ViewTransition exit="onboarding-card-swap" default="none">
      <section
        className={clsx(
          "animate-onboarding-step-in relative overflow-hidden rounded-lg border border-primary-fixed bg-white/85 p-7 shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur-md sm:p-10",
          className,
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-primary/5 to-transparent" />

        <div className="relative z-10 flex flex-col gap-7">
          <header className="flex items-start gap-4">
            {portrait ? (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-primary-fixed ring-1 ring-primary-fixed">
                <Image
                  src={portrait}
                  alt={portraitAlt ?? ""}
                  fill
                  sizes="56px"
                  className="object-cover object-top"
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <h1 className="text-balance break-words text-headline-lg tracking-tight text-on-surface">
                {title}
              </h1>
              {subtitle ? <p className="text-body-md text-on-surface-variant">{subtitle}</p> : null}
            </div>
          </header>

          {children}
        </div>
      </section>
    </ViewTransition>
  );
}

// Every step ends with exactly one filled indigo control, bottom-right, with
// optional quiet escape to its left.
export function StepActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-primary-fixed pt-6">
      {children}
    </div>
  );
}
