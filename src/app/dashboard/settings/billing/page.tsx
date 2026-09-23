import { redirect } from "next/navigation";
import Image from "next/image";
import clsx from "clsx";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { reconcileBillingFromStripe } from "@/lib/stripe/webhooks";
import { getPlan, getSelfServePlansForVariant, TRIAL_DAYS, TRIAL_REPLY_LIMIT, type PlanKey } from "@/lib/billing/plans";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentPhoto } from "@/lib/agents/media";
import {
  BadgeCheckIcon,
  CalendarIcon,
  CartIcon,
  ChatIcon,
  ClockIcon,
  InfoIcon,
  WhatsAppIcon,
} from "@/components/ui/icons";
import { StatusBanner } from "@/components/ui/status-banner";
import { PageHeader } from "../../page-header";
import { CheckoutButton, EndTrialButton, ManageBillingButton } from "./billing-actions";
import { PlanTiers } from "./plan-tiers";
import { UsageRing } from "./usage-ring";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
const BRL_WHOLE = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const DAY_MS = 86_400_000;
const ENTERPRISE_MAILTO = "mailto:contato@staffra.com?subject=Enterprise";
const SHELL =
  "relative overflow-hidden rounded-[28px] border border-outline-variant/60 bg-surface-container-lowest shadow-[0_1px_2px_rgba(25,28,29,0.04),0_24px_60px_-28px_rgba(53,37,205,0.22)]";

type Billing = {
  plan_key: PlanKey;
  subscription_status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
};

type TeamMember = { name: string; photo: string | null };

function StatusPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === "active"
      ? "bg-success-100 text-success-500"
      : status === "trialing"
        ? "bg-primary-fixed text-primary"
        : status === "past_due" || status === "unpaid"
          ? "bg-error-container text-on-error-container"
          : "bg-surface-container text-on-surface-variant";
  return (
    <span className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold", tone)}>
      <span
        aria-hidden="true"
        className={clsx("h-2 w-2 rounded-full bg-current", status === "active" && "inbox-live-dot")}
      />
      {label}
    </span>
  );
}

function TeamFaces({ team, size = "lg" }: { team: TeamMember[]; size?: "lg" | "sm" }) {
  return (
    <div className={clsx("flex", size === "lg" ? "-space-x-3" : "-space-x-2")}>
      {team.slice(0, 3).map((member, i) => (
        <span
          key={member.name}
          className={clsx(
            "inbox-face-in relative flex items-center justify-center overflow-hidden rounded-full bg-primary-fixed ring-surface-container-lowest",
            size === "lg" ? "h-11 w-11 ring-4" : "h-8 w-8 ring-2",
          )}
          style={{ "--i": i } as React.CSSProperties}
        >
          {member.photo ? (
            <Image src={member.photo} alt={member.name} fill sizes="44px" className="object-cover object-top" />
          ) : (
            <span className="text-base font-semibold text-primary">{member.name.charAt(0).toUpperCase()}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function TrialFact({ icon: Icon, children }: { icon: typeof ChatIcon; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container-lowest text-primary shadow-[0_1px_2px_rgba(25,28,29,0.06)]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium text-on-surface">{children}</span>
    </li>
  );
}

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

  const [{ data: membership }, { data: billingRow }, { data: userRow }, { data: teamRows }] = await Promise.all([
    supabase.from("company_users").select("role").eq("company_id", company.id).eq("user_id", user!.id).maybeSingle(),
    supabase
      .from("company_billing")
      .select(
        "plan_key, subscription_status, current_period_start, current_period_end, cancel_at_period_end, stripe_customer_id",
      )
      .eq("company_id", company.id)
      .maybeSingle(),
    supabase.from("users").select("trial_used_at").eq("id", user!.id).maybeSingle(),
    supabase
      .from("company_agents")
      .select("name, photo_type, photo_asset_url, agents(slug)")
      .eq("company_id", company.id),
  ]);
  const trialAvailable = !userRow?.trial_used_at;
  const canEdit = membership ? ["owner", "admin"].includes(membership.role) : false;
  let billing = billingRow as Billing | null;

  const team: TeamMember[] = (teamRows ?? []).flatMap((row) => {
    const slug = (row.agents as unknown as { slug: string } | null)?.slug;
    if (!slug) return [];
    return [
      {
        name: (row.name as string | null) ?? defaultAgentName(slug),
        photo: resolveAgentPhoto(slug, row.photo_type ?? null, row.photo_asset_url ?? null),
      },
    ];
  });

  if (billing?.stripe_customer_id) {
    const reconciled = await reconcileBillingFromStripe(createServiceClient(), company.id);
    if (reconciled) {
      const { data: fresh } = await supabase
        .from("company_billing")
        .select(
          "plan_key, subscription_status, current_period_start, current_period_end, cancel_at_period_end, stripe_customer_id",
        )
        .eq("company_id", company.id)
        .maybeSingle();
      billing = (fresh as Billing | null) ?? billing;
    }
  }

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
  const hasPlan = isActive || isLapsedPayment;

  const plan = billing ? getPlan(billing.plan_key) : null;
  const renewsOn = billing?.current_period_end ? dateFmt.format(new Date(billing.current_period_end)) : null;
  const nowMs = new Date().getTime();
  const periodStartMs = billing?.current_period_start ? new Date(billing.current_period_start).getTime() : null;
  const periodEndMs = billing?.current_period_end ? new Date(billing.current_period_end).getTime() : null;
  const daysUntilReset = periodEndMs !== null ? Math.max(0, Math.ceil((periodEndMs - nowMs) / DAY_MS)) : null;
  const periodDays =
    periodStartMs !== null && periodEndMs !== null
      ? Math.max(1, Math.round((periodEndMs - periodStartMs) / DAY_MS))
      : null;
  const periodDay =
    periodDays !== null && periodStartMs !== null
      ? Math.min(periodDays, Math.max(1, Math.ceil((nowMs - periodStartMs) / DAY_MS)))
      : null;

  const used = usage?.replies_used ?? 0;
  const limit = usage?.reply_limit ?? plan?.monthlyReplyLimit ?? 0;
  const rawPct = limit > 0 ? (used / limit) * 100 : 0;
  const overLimit = limit > 0 && used >= limit;
  const nearLimit = limit > 0 && rawPct >= 80 && !overLimit;

  const currentVariantPlans =
    plan && plan.key !== "enterprise"
      ? getSelfServePlansForVariant(plan.billingPeriod ?? "monthly", plan.whatsappIncluded)
      : [];
  const currentSelfServeIndex = currentVariantPlans.findIndex((p) => p.key === billing?.plan_key);
  const nextSelfServePlan =
    currentSelfServeIndex >= 0 && currentSelfServeIndex < currentVariantPlans.length - 1
      ? currentVariantPlans[currentSelfServeIndex + 1]
      : null;

  const showPanelEndTrial = status === "trialing" && !overLimit && !nearLimit;

  const readyLine =
    team.length === 1
      ? t("hero.readyOne", { name: team[0].name })
      : team.length > 1
        ? t("hero.readyMany", {
            names: new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(team.map((m) => m.name)),
          })
        : null;

  const banner = isLapsedPayment ? (
    <StatusBanner
      tone="error"
      title={t("banner.pastDue.title")}
      body={t("banner.pastDue.body")}
      action={
        canEdit ? (
          <ManageBillingButton companyId={company.id} label={t("banner.pastDue.action")} variant="danger" />
        ) : null
      }
    />
  ) : isActive && overLimit ? (
    <StatusBanner
      tone="error"
      title={status === "trialing" ? t("banner.trialOverLimit.title") : t("banner.overLimit.title")}
      body={
        status === "trialing"
          ? t("banner.trialOverLimit.body")
          : nextSelfServePlan
            ? t("banner.overLimit.body")
            : t("banner.overLimit.bodyMaxPlan")
      }
      action={
        canEdit ? (
          status === "trialing" ? (
            <EndTrialButton companyId={company.id} label={t("banner.trialOverLimit.action")} variant="danger" />
          ) : nextSelfServePlan ? (
            <CheckoutButton
              companyId={company.id}
              planKey={nextSelfServePlan.key as Exclude<PlanKey, "enterprise">}
              label={t("banner.overLimit.action")}
              variant="danger"
            />
          ) : (
            <a
              href={ENTERPRISE_MAILTO}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-error px-5 text-label-md font-semibold text-on-error transition-[filter] hover:brightness-95"
            >
              {t("banner.overLimit.actionContact")}
            </a>
          )
        ) : null
      }
    />
  ) : isActive && nearLimit ? (
    <StatusBanner
      tone="warn"
      title={t("banner.nearLimit.title")}
      body={t("banner.nearLimit.body", { left: Math.max(0, limit - used) })}
      action={
        canEdit ? (
          status === "trialing" ? (
            <EndTrialButton companyId={company.id} label={t("banner.trialOverLimit.action")} />
          ) : nextSelfServePlan ? (
            <CheckoutButton
              companyId={company.id}
              planKey={nextSelfServePlan.key as Exclude<PlanKey, "enterprise">}
              label={t("banner.nearLimit.action")}
            />
          ) : (
            <a
              href={ENTERPRISE_MAILTO}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-label-md font-semibold text-on-primary transition-[filter] hover:brightness-110"
            >
              {t("banner.nearLimit.actionContact")}
            </a>
          )
        ) : null
      }
    />
  ) : null;

  const enterpriseStrip =
    plan?.key !== "enterprise" ? (
      <div className="flex flex-col gap-3 rounded-[20px] border border-dashed border-outline-variant px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-label-md font-semibold text-on-surface">{t("enterprise.title")}</p>
          <p className="mt-0.5 text-sm text-on-surface-variant">{t("enterprise.body")}</p>
        </div>
        <a
          href={ENTERPRISE_MAILTO}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest px-5 text-label-md font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-primary"
        >
          {t("enterprise.cta")}
        </a>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={CartIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      {!canEdit ? (
        <p className="flex items-center gap-2 rounded-2xl bg-surface-container px-4 py-3 text-sm text-on-surface-variant">
          <InfoIcon className="h-4 w-4 shrink-0" />
          {t("readOnly")}
        </p>
      ) : null}

      {banner}

      {hasPlan && plan ? (
        <>
          <section className={clsx(SHELL, "grid lg:grid-cols-[1fr_340px]")}>
            <div className="flex flex-col gap-6 p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[32px] font-semibold leading-none tracking-[-0.02em] text-on-surface">
                  {plan.displayName}
                </h2>
                <StatusPill status={status!} label={t(`status.${status}`)} />
                {plan.whatsappIncluded ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 text-[12px] font-semibold text-on-surface-variant">
                    <WhatsAppIcon className="h-3.5 w-3.5 text-[#1faa55]" />
                    {t("picker.wppBadge")}
                  </span>
                ) : null}
              </div>

              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[48px] font-semibold leading-none tracking-[-0.03em] text-on-surface tabular-nums">
                    {plan.priceBrlCents !== null ? BRL.format(plan.priceBrlCents / 100) : t("plan.custom")}
                  </span>
                  {plan.priceBrlCents !== null ? (
                    <span className="text-on-surface-variant">
                      {plan.billingPeriod === "annual" ? t("perYear") : t("perMonth")}
                    </span>
                  ) : null}
                </div>
                {plan.billingPeriod === "annual" && plan.priceBrlCents !== null ? (
                  <p className="mt-2 text-sm text-on-surface-variant">
                    {t("tiers.monthlyEquivalent", { price: BRL_WHOLE.format(Math.round(plan.priceBrlCents / 1200)) })}
                  </p>
                ) : null}
              </div>

              {isLapsedPayment ? (
                <p className="mt-auto flex items-center gap-2 text-sm font-medium text-on-error-container">
                  <ClockIcon className="h-4 w-4" />
                  {t("panel.paymentPending")}
                </p>
              ) : (
                <div className="mt-auto flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span
                      className={clsx(
                        "flex items-center gap-2 font-medium",
                        status === "trialing" ? "text-primary" : "text-on-surface",
                      )}
                    >
                      <CalendarIcon className="h-4 w-4 opacity-70" />
                      {status === "trialing"
                        ? t("panel.trialEndsOn", { date: renewsOn ?? "" })
                        : billing!.cancel_at_period_end
                          ? t("endsOn", { date: renewsOn ?? "" })
                          : renewsOn
                            ? t("renewsOn", { date: renewsOn })
                            : t("noRenewalDate")}
                    </span>
                    {periodDay !== null && periodDays !== null ? (
                      <span className="tabular-nums text-on-surface-variant">
                        {t("panel.dayOf", { day: periodDay, total: periodDays })}
                      </span>
                    ) : null}
                  </div>
                  {periodDay !== null && periodDays !== null ? (
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-container">
                      <div
                        className="billing-bar-in h-full origin-left rounded-full bg-on-surface-variant/50"
                        style={{ width: `${Math.max(3, (periodDay / periodDays) * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {canEdit && (showPanelEndTrial || billing?.stripe_customer_id) ? (
                <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant/50 pt-6">
                  {showPanelEndTrial ? (
                    <EndTrialButton
                      companyId={company.id}
                      label={t("endTrialNow", { plan: plan.displayName })}
                      variant="primary"
                    />
                  ) : null}
                  {billing?.stripe_customer_id ? (
                    <ManageBillingButton companyId={company.id} label={t("manageBilling")} variant="secondary" />
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col items-center justify-center gap-4 border-t border-outline-variant/50 bg-surface-container-low/60 p-6 sm:p-8 lg:border-l lg:border-t-0">
              {team.length > 0 && limit > 0 ? (
                <div className="flex items-center gap-2.5">
                  <TeamFaces team={team} size="sm" />
                  <span className="text-[13px] font-medium text-on-surface-variant">{t("panel.teamReplies")}</span>
                </div>
              ) : null}
              {limit > 0 ? (
                <UsageRing used={used} limit={limit} />
              ) : (
                <p className="max-w-[16rem] text-center text-sm text-on-surface-variant">{t("panel.noUsage")}</p>
              )}
              {limit > 0 && daysUntilReset !== null && status === "active" ? (
                <p className="text-[13px] text-on-surface-variant">{t("usage.resetsIn", { days: daysUntilReset })}</p>
              ) : null}
              {overLimit && isActive ? (
                <p className="text-center text-[13px] font-medium text-error">{t("usage.overNote")}</p>
              ) : null}
            </div>
          </section>

          {plan.key !== "enterprise" && !isLapsedPayment ? (
            <section className="flex flex-col gap-2">
              <div className="flex flex-col items-center gap-1 text-center">
                <h2 className="text-headline-md font-semibold tracking-tight text-on-surface">
                  {t("tiers.switchTitle")}
                </h2>
                <p className="max-w-lg text-balance text-sm text-on-surface-variant">{t("tiers.switchBody")}</p>
              </div>
              <div className="mt-4">
                <PlanTiers companyId={company.id} canEdit={canEdit} trialAvailable={false} currentPlanKey={plan.key} />
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <>
          <section className={clsx(SHELL, "grid", trialAvailable && "lg:grid-cols-[1fr_360px]")}>
            <div className="relative overflow-hidden px-6 py-8 sm:px-10 sm:py-10">
              <div
                aria-hidden="true"
                className="billing-hero-glow pointer-events-none absolute -left-32 -top-40 h-[26rem] w-[26rem] rounded-full"
              />
              <div className="relative max-w-xl">
                {isCanceled ? (
                  <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-surface-container px-3 py-1 text-[12px] font-semibold text-on-surface-variant">
                    <ClockIcon className="h-3.5 w-3.5" />
                    {t("banner.canceled.title", { date: renewsOn ?? "" })}
                  </p>
                ) : null}
                <h2 className="text-balance text-[34px] font-semibold leading-[1.1] tracking-[-0.025em] text-on-surface sm:text-[44px]">
                  {isCanceled ? t("hero.reactivateTitle") : t("hero.title")}
                </h2>
                <p className="mt-3 max-w-lg text-body-lg text-on-surface-variant">
                  {isCanceled ? t("hero.reactivateBody") : t("hero.body")}
                </p>
                {team.length > 0 ? (
                  <div className="mt-7 flex items-center gap-3">
                    <TeamFaces team={team} />
                    {readyLine ? <p className="text-sm text-on-surface-variant">{readyLine}</p> : null}
                  </div>
                ) : null}
              </div>
            </div>

            {trialAvailable ? (
              <ul className="flex flex-col justify-center gap-4 border-t border-outline-variant/50 bg-primary-fixed/35 px-6 py-7 sm:px-8 lg:border-l lg:border-t-0">
                <TrialFact icon={CalendarIcon}>{t("trial.days", { days: TRIAL_DAYS })}</TrialFact>
                <TrialFact icon={ChatIcon}>{t("trial.replies", { limit: TRIAL_REPLY_LIMIT })}</TrialFact>
                <TrialFact icon={BadgeCheckIcon}>{t("trial.converts")}</TrialFact>
              </ul>
            ) : null}
          </section>

          <PlanTiers companyId={company.id} canEdit={canEdit} trialAvailable={trialAvailable} />
        </>
      )}

      {enterpriseStrip}
    </div>
  );
}
