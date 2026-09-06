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
export function BillingPastDueAlert({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Dashboard");
  return (
    <Link
      href="/dashboard/settings/billing"
      aria-label={t("billingPastDueAlert")}
      className={
        compact
          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-error/30 bg-error-container/60 text-error"
          : "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-error/30 bg-error-container/60 px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:brightness-95"
      }
    >
      <WarningIcon className="h-3.5 w-3.5 shrink-0" />
      {compact ? null : t("billingPastDueAlert")}
    </Link>
  );
}
