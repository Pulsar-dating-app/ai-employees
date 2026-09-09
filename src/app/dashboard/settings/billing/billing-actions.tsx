"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { SpinnerIcon } from "@/components/ui/icons";

// Trello P5 -- every button on the billing page that leaves for Stripe.
// Each POSTs to one of our billing routes and follows the `url` it returns
// (a Checkout Session or a Billing Portal session). There is no in-page
// plan switcher: the change always happens on Stripe, and P4's webhook
// syncs `company_billing` when it's done.

type Variant = "primary" | "secondary" | "link" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "h-11 rounded-lg bg-primary px-5 text-label-md font-semibold text-on-primary transition-all hover:brightness-90",
  secondary:
    "h-11 rounded-lg border border-outline-variant bg-surface-container px-5 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-high",
  danger:
    "h-11 rounded-lg bg-error px-5 text-label-md font-semibold text-on-error transition-colors hover:brightness-95",
  link: "text-label-md font-medium text-primary transition-colors hover:text-primary-container hover:underline",
};

function useRedirectAction() {
  const t = useTranslations("Billing");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `go()` deliberately leaves `pending` true after `window.location.assign`
  // so the button can't be re-fired mid-navigation. But if the customer
  // then hits the browser Back button from Stripe, this page is restored
  // from the bfcache with that frozen state -- the button would spin
  // forever. `pageshow` fires on every load *and* on a bfcache restore, so
  // clearing here un-sticks it.
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function go(url: string, body: unknown) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !json?.url) {
        setError(json?.error ?? t("actionError"));
        setPending(false);
        return;
      }
      window.location.assign(json.url);
      // leave `pending` true through the navigation
    } catch {
      setError(t("actionError"));
      setPending(false);
    }
  }

  return { pending, error, go };
}

function ActionButton({
  onClick,
  pending,
  disabled,
  variant,
  fullWidth,
  children,
}: {
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
  variant: Variant;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      className={clsx(
        "inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT_CLASSES[variant],
        fullWidth && "w-full",
      )}
    >
      {pending ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

// Start (or, for an existing subscriber, deep-link the plan switch of) a
// subscription to `planKey`.
export function CheckoutButton({
  companyId,
  planKey,
  label,
  variant = "primary",
  fullWidth,
}: {
  companyId: string;
  planKey: "starter" | "pro";
  label: string;
  variant?: Variant;
  fullWidth?: boolean;
}) {
  const { pending, error, go } = useRedirectAction();
  return (
    <div className={clsx("flex flex-col gap-1", fullWidth && "w-full")}>
      <ActionButton
        variant={variant}
        pending={pending}
        fullWidth={fullWidth}
        onClick={() => go(`/api/companies/${companyId}/billing/checkout`, { planKey })}
      >
        {label}
      </ActionButton>
      {error ? <p className="text-label-sm text-error">{error}</p> : null}
    </div>
  );
}

// Trello P8 -- ends a free trial early (trial_end -> "now" on the Stripe
// side), charging the card on file immediately for the full plan instead of
// waiting out the rest of the 15 days. No Stripe redirect: on success we
// just reload so the Server Component re-reads company_billing (its own
// reconcile-from-Stripe backstop picks up the fresh status right away, even
// before P4's webhook lands).
export function EndTrialButton({
  companyId,
  label,
  variant = "primary",
  fullWidth,
}: {
  companyId: string;
  label: string;
  variant?: Variant;
  fullWidth?: boolean;
}) {
  const t = useTranslations("Billing");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/billing/end-trial`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? t("actionError"));
        setPending(false);
        return;
      }
      window.location.reload();
      // leave `pending` true through the reload
    } catch {
      setError(t("actionError"));
      setPending(false);
    }
  }

  return (
    <div className={clsx("flex flex-col gap-1", fullWidth && "w-full")}>
      <ActionButton variant={variant} pending={pending} fullWidth={fullWidth} onClick={onClick}>
        {label}
      </ActionButton>
      {error ? <p className="text-label-sm text-error">{error}</p> : null}
    </div>
  );
}

// Open the Stripe Billing Portal home (card, invoices, cancellation).
export function ManageBillingButton({
  companyId,
  label,
  variant = "secondary",
  fullWidth,
}: {
  companyId: string;
  label: string;
  variant?: Variant;
  fullWidth?: boolean;
}) {
  const { pending, error, go } = useRedirectAction();
  return (
    <div className={clsx("flex flex-col gap-1", fullWidth && "w-full")}>
      <ActionButton
        variant={variant}
        pending={pending}
        fullWidth={fullWidth}
        onClick={() => go(`/api/companies/${companyId}/billing/portal`, {})}
      >
        {label}
      </ActionButton>
      {error ? <p className="text-label-sm text-error">{error}</p> : null}
    </div>
  );
}
