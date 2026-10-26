"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { ONBOARDING_STEPS, stepIndex, type OnboardingStep } from "@/lib/companies/onboarding-step";
import { track } from "@/lib/funnel/client";

function currentStep(pathname: string): OnboardingStep {
  if (pathname.startsWith("/onboarding/live")) return "live";
  if (pathname.startsWith("/onboarding/plan")) return "plan";
  if (pathname.startsWith("/onboarding/ready")) return "ready";
  if (pathname.startsWith("/onboarding/setup")) return "setup";
  if (pathname.startsWith("/onboarding/hire")) return "hire";
  if (pathname.startsWith("/onboarding/profile")) return "profile";
  return "company";
}

// One hairline segment per step, the reached ones filled. Deliberately no numerals
// and no percentage: a progress meter invites the merchant to optimise for
// finishing, and this flow's point is that each step leaves the hire more
// capable rather than the bar more full.
export function StepRail() {
  const t = useTranslations("Onboarding.rail");
  const pathname = usePathname();
  const active = currentStep(pathname);
  const activeIndex = stepIndex(active);

  // The rail is on every step and already knows which one is showing, so it
  // records the funnel's step views -- in an effect, never during a render a
  // prefetch could trigger.
  useEffect(() => {
    track("onboarding_step_viewed", { step: active });
  }, [active]);

  return (
    // The step name is carried by each segment's own sr-only label and by the
    // card's heading. Repeating it as an uppercase line above that heading is
    // a kicker, which the heading never needs.
    <nav aria-label={t("label")} className="mb-8 flex flex-col items-center gap-2.5">
      <ol className="flex w-full items-center gap-1.5">
        {ONBOARDING_STEPS.map((step, i) => {
          const reached = i <= activeIndex;
          return (
            <li
              key={step}
              aria-current={step === active ? "step" : undefined}
              className="h-[3px] flex-1 overflow-hidden rounded-full bg-outline-variant/45"
            >
              <span
                className={clsx(
                  "block h-full rounded-full bg-primary transition-transform duration-500 ease-out",
                  reached ? "scale-x-100" : "scale-x-0",
                )}
                style={{ transformOrigin: "left" }}
              />
              <span className="sr-only">{t(step)}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
