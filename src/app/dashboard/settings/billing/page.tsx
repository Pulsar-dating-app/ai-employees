import { redirect } from "next/navigation";
import clsx from "clsx";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BILLING_PLANS, getPlan, type PlanKey } from "@/lib/billing/plans";
import { CartIcon, CalendarIcon, InfoIcon, WarningIcon } from "@/components/ui/icons";
import { PageHeader } from "../../page-header";
import { CheckoutButton, ManageBillingButton } from "./billing-actions";

// Trello P5 -- /dashboard/settings/billing. The merchant's view of the plan
// (P1), the usage counter (P2), and the doors into Stripe Checkout (P3) /
// the Customer Portal (P3/P5's portal route). No billing logic lives here:
// it reads `company_billing` + the current period's `company_message_usage`
// and links out. P4's webhook is what keeps those rows current.

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

type Billing = {
  plan_key: PlanKey;
  subscription_status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
};

function StatusChip({ status, label }: { status: string; label: string }) {
  const tone =
    status === "active" || status === "trialing"
      ? "border-secondary-container/40 bg-secondary-container/20 text-tertiary"
      : status === "past_due" || status === "unpaid"
        ? "border-error/20 bg-error-container/40 text-error"
        : status === "incomplete"
          ? "border-primary-fixed bg-primary-fixed/60 text-primary"
          : "border-outline-variant/30 bg-surface-container text-on-surface-variant";
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-label-sm font-semibold",
        tone,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function Banner({
  tone,
  title,
  body,
  action,
}: {
  tone: "error" | "warn" | "neutral";
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  const styles = {
    error: "border-error/30 bg-error-container/50 text-error [&_p]:text-on-error-container",
    warn: "border-[#ffe082] bg-[#fff8e1] text-[#8a5a00] [&_p]:text-[#8a5a00]",
    neutral: "border-outline-variant/40 bg-surface-container text-on-surface [&_p]:text-on-surface-variant",
  }[tone];
  const Icon = tone === "neutral" ? InfoIcon : WarningIcon;
  return (
    <div
      className={clsx(
        "flex flex-col gap-3 rounded-xl border p-5 shadow-level1 sm:flex-row sm:items-center sm:justify-between",
        styles,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h3 className="text-label-md font-bold">{title}</h3>
          <p className="mt-1 text-label-md">{body}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

const CARD = "rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-level1";

export default async function BillingPage() {
  const supabase = await createClient();
  const [t, locale] = await Promise.all([getTranslations("Billing"), getLocale()]);
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  const [
    {
      data: { user },
    },
    { data: companies },
  ] = await Promise.all([supabase.auth.getUser(), supabase.from("companies").select("id, name")]);
  const company = companies?.[0] ?? null;
  if (!company) redirect("/onboarding");

  const [{ data: membership }, { data: billingRow }] = await Promise.all([
    supabase
      .from("company_users")
      .select("role")
      .eq("company_id", company.id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("company_billing")
      .select(
        "plan_key, subscription_status, current_period_start, current_period_end, cancel_at_period_end, stripe_customer_id",
      )
      .eq("company_id", company.id)
      .maybeSingle(),
  ]);
  const canEdit = membership ? ["owner", "admin"].includes(membership.role) : false;
  const billing = billingRow as Billing | null;

  let usage: { replies_used: number; reply_limit: number } | null = null;
  if (billing?.current_period_start) {
    const { data } = await supabase
      .from("company_message_usage")
      .select("replies_used, reply_limit")
      .eq("company_id", company.id)
      .eq("period_start", billing.current_period_start)
      .maybeSingle();
    usage = data ?? null;
  }

  const status = billing?.subscription_status ?? null;
  const isActive = status === "active" || status === "trialing";
  const isLapsedPayment = status === "past_due" || status === "unpaid";
  const isCanceled = status === "canceled";

  const plan = billing ? getPlan(billing.plan_key) : null;
  const renewsOn = billing?.current_period_end ? dateFmt.format(new Date(billing.current_period_end)) : null;
  const nowMs = new Date().getTime();
  const daysUntilReset = billing?.current_period_end
    ? Math.max(0, Math.ceil((new Date(billing.current_period_end).getTime() - nowMs) / 86_400_000))
    : null;

  const used = usage?.replies_used ?? 0;
  const limit = usage?.reply_limit ?? plan?.monthlyReplyLimit ?? 0;
  const rawPct = limit > 0 ? (used / limit) * 100 : 0;
  const overLimit = limit > 0 && used >= limit;
  const nearLimit = limit > 0 && rawPct >= 80 && !overLimit;

  const selfServePlans = BILLING_PLANS.filter((p) => p.isSelfServe);
  const currencyNote = t("currencyNote");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={CartIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      {!canEdit ? (
        <p className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant">
          {t("readOnly")}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* MAIN COLUMN */}
        <div className="flex flex-col gap-6 lg:col-span-8">
          {isLapsedPayment ? (
            <Banner
              tone="error"
              title={t("banner.pastDue.title")}
              body={t("banner.pastDue.body")}
              action={
                canEdit ? (
                  <ManageBillingButton
                    companyId={company.id}
                    label={t("banner.pastDue.action")}
                    variant="danger"
                  />
                ) : null
              }
            />
          ) : null}

          {isActive && overLimit ? (
            <Banner
              tone="error"
              title={t("banner.overLimit.title")}
              body={t("banner.overLimit.body")}
              action={
                canEdit ? (
                  <CheckoutButton companyId={company.id} planKey="pro" label={t("banner.overLimit.action")} />
                ) : null
              }
            />
          ) : isActive && nearLimit ? (
            <Banner
              tone="warn"
              title={t("banner.nearLimit.title")}
              body={t("banner.nearLimit.body", { left: Math.max(0, limit - used) })}
              action={
                canEdit ? (
                  <CheckoutButton companyId={company.id} planKey="pro" label={t("banner.nearLimit.action")} />
                ) : null
              }
            />
          ) : null}

          {isActive || isLapsedPayment ? (
            <>
              {/* Current plan */}
              <div className={CARD}>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-headline-md font-semibold text-on-surface">{plan!.displayName}</h2>
                  <StatusChip status={status!} label={t(`status.${status}`)} />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-headline-lg font-semibold tracking-tight text-on-surface">
                    {BRL.format(plan!.priceBrlCents / 100)}
                  </span>
                  <span className="text-on-surface-variant">{t("perMonth")}</span>
                </div>
                <p className="mt-1 text-sm text-on-surface-variant">{currencyNote}</p>

                <div className="mt-6 flex flex-col gap-4 border-t border-outline-variant/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2 text-label-md text-on-surface">
                    <CalendarIcon className="h-5 w-5 text-on-surface-variant" />
                    {billing!.cancel_at_period_end
                      ? t("endsOn", { date: renewsOn ?? "" })
                      : renewsOn
                        ? t("renewsOn", { date: renewsOn })
                        : t("noRenewalDate")}
                  </p>
                  {canEdit ? (
                    <div className="flex flex-wrap items-center gap-4">
                      {plan!.key === "starter" ? (
                        <CheckoutButton
                          companyId={company.id}
                          planKey="pro"
                          label={t("upgradeToPro")}
                          variant="link"
                        />
                      ) : plan!.key === "pro" ? (
                        <CheckoutButton
                          companyId={company.id}
                          planKey="starter"
                          label={t("switchToStarter")}
                          variant="link"
                        />
                      ) : null}
                      <span className="hidden h-1 w-1 rounded-full bg-outline-variant sm:block" />
                      <ManageBillingButton
                        companyId={company.id}
                        label={t("manageBilling")}
                        variant="link"
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Usage */}
              <div className={CARD}>
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <h3 className="text-xs font-semibold uppercase tracking-wider">{t("usage.label")}</h3>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-headline-lg font-semibold tracking-tight text-on-surface">
                    {t("usage.count", { used, limit })}
                  </span>
                  {daysUntilReset !== null ? (
                    <span className="text-sm text-on-surface-variant">
                      {t("usage.resetsIn", { days: daysUntilReset })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-container">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all",
                      overLimit ? "bg-error" : nearLimit ? "bg-[#e0902f]" : "bg-primary",
                    )}
                    style={{ width: `${Math.min(100, Math.max(2, rawPct))}%` }}
                  />
                </div>
                {overLimit ? (
                  <p className="mt-2 text-sm text-error">{t("usage.overNote")}</p>
                ) : null}
              </div>
            </>
          ) : (
            /* No plan / canceled -> activate */
            <div className={CARD}>
              {isCanceled ? (
                <Banner
                  tone="neutral"
                  title={t("banner.canceled.title", { date: renewsOn ?? "" })}
                  body={t("banner.canceled.body")}
                />
              ) : null}
              <div className={isCanceled ? "mt-6" : undefined}>
                <h2 className="text-headline-md font-semibold text-on-surface">
                  {isCanceled ? t("reactivate.title") : t("activate.title")}
                </h2>
                <p className="mt-1 max-w-xl text-body-md text-on-surface-variant">
                  {isCanceled ? t("reactivate.body") : t("activate.body")}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {selfServePlans.map((p) => (
                  <div
                    key={p.key}
                    className="flex flex-col rounded-lg border border-outline-variant/60 bg-surface-container-low p-5"
                  >
                    <h3 className="text-label-md font-bold text-on-surface">{p.displayName}</h3>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-headline-lg font-semibold text-on-surface">
                        {BRL.format(p.priceBrlCents / 100)}
                      </span>
                      <span className="text-sm text-on-surface-variant">{t("perMonth")}</span>
                    </div>
                    <p className="mt-3 text-sm text-on-surface-variant">
                      {t("plan.replies", { limit: p.monthlyReplyLimit })}
                    </p>
                    <p className="mt-1 text-sm text-on-surface-variant">{t("plan.teammates")}</p>
                    <div className="mt-5">
                      {canEdit ? (
                        <CheckoutButton
                          companyId={company.id}
                          planKey={p.key as "starter" | "pro"}
                          label={t("choosePlan", { plan: p.displayName })}
                          fullWidth
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-sm text-on-surface-variant">{currencyNote}</p>
            </div>
          )}

          {/* Enterprise */}
          {plan?.key !== "enterprise" ? (
            <div className="flex flex-col gap-1 rounded-xl border border-outline-variant/60 bg-surface-container-low px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-label-md font-semibold text-on-surface">{t("enterprise.title")}</p>
                <p className="text-sm text-on-surface-variant">{t("enterprise.body")}</p>
              </div>
              <a
                href="mailto:contato@staffra.com?subject=Enterprise"
                className="text-label-md font-medium text-primary hover:underline"
              >
                {t("enterprise.cta")}
              </a>
            </div>
          ) : null}
        </div>

        {/* ASIDE */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 flex flex-col gap-4">
            <div className={CARD}>
              <h3 className="border-b border-outline-variant/60 pb-4 text-label-md font-bold text-on-surface">
                {t("summary.title")}
              </h3>
              <dl className="mt-4 flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-on-surface-variant">{t("summary.plan")}</dt>
                  <dd className="font-semibold text-on-surface">
                    {plan ? plan.displayName : t("summary.none")}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-on-surface-variant">{t("summary.status")}</dt>
                  <dd>
                    <StatusChip
                      status={status ?? "none"}
                      label={status ? t(`status.${status}`) : t("summary.none")}
                    />
                  </dd>
                </div>
                {renewsOn ? (
                  <div className="flex items-center justify-between">
                    <dt className="text-on-surface-variant">
                      {billing?.cancel_at_period_end ? t("summary.endsOn") : t("summary.nextRenewal")}
                    </dt>
                    <dd className="text-on-surface">{renewsOn}</dd>
                  </div>
                ) : null}
              </dl>
              {canEdit && billing?.stripe_customer_id ? (
                <div className="mt-6">
                  <ManageBillingButton
                    companyId={company.id}
                    label={t("summary.manageInStripe")}
                    variant="secondary"
                    fullWidth
                  />
                </div>
              ) : null}
              <p className="mt-4 text-center text-xs text-on-surface-variant">{t("summary.support")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
