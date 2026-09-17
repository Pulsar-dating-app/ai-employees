import clsx from "clsx";

// The onboarding flow's own loading mark, standing in for the plain ring
// spinner everywhere a CTA here is mid-request: hiring an agent, saving her
// setup, starting a plan. A small liquid shape that keeps morphing and
// turning rather than a static ring going round -- reads as her doing
// something, not the button being stuck. `currentColor` so it always
// matches whatever text color the button it sits in already uses.
export function OnboardingLoader({ className }: { className?: string }) {
  return <span aria-hidden className={clsx("onboarding-loader shrink-0", className)} />;
}
