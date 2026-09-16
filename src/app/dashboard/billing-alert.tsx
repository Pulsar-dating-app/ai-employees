"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { WarningIcon } from "@/components/ui/icons";

// Trello P4/P5 follow-up -- a past_due/unpaid subscription silences every
// bot on every channel (the reply gate), but until now the only place that
// said so anywhere in the app was the billing settings page's own banner.
// A merchant who doesn't happen to visit Settings > Billing had zero signal
// their team went dark. This surfaces the same fact in the dashboard shell
// itself (top bar on desktop, mobile header), so it's visible no matter
// which page they land on after logging in. Links straight to the billing
// page, which owns the actual fix action (update payment method).
// Two ways a team goes silent, and a merchant needs to be told which: a
// payment that failed ("fix your card") and a plan that was never chosen
// ("pick one"). Same placement, same shape, different tone -- no_plan is not
// an error, it is the product waiting to be paid for.
export type SilenceReason = "past_due" | "no_plan";

export function BillingPastDueAlert({
  compact = false,
  reason = "past_due",
}: {
  compact?: boolean;
  reason?: SilenceReason;
}) {
  const t = useTranslations("Dashboard");
  const label = reason === "no_plan" ? t("noPlanAlert") : t("billingPastDueAlert");
  const tone =
    reason === "no_plan"
      ? "border-primary/30 bg-primary-fixed text-primary"
      : "border-error/30 bg-error-container/60 text-error";
  return (
    <Link
      href="/dashboard/settings/billing"
      aria-label={label}
      className={
        compact
          ? `flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${tone}`
          : `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-95 ${tone}`
      }
    >
      <WarningIcon className="h-3.5 w-3.5 shrink-0" />
      {compact ? null : label}
    </Link>
  );
}
