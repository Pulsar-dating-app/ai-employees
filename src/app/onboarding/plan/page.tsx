import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirectTargetFor, resolveOnboardingState } from "@/lib/companies/onboarding-step";
import { finishOnboarding } from "@/lib/companies/finish-onboarding";
import { getSelfServePlans, TRIAL_DAYS } from "@/lib/billing/plans";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentPhoto } from "@/lib/agents/media";
import { StepCard } from "../step-card";
import { PlanPicker, type PlanOption } from "./plan-picker";

// The last step, and deliberately after the proof rather than before it: the
// merchant decides at the moment she has just answered them with their own
// catalogue or agenda, not while they are still being asked to set things up.
export default async function OnboardingPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const [{ checkout }, supabase] = await Promise.all([searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Back from Stripe with a subscription started. The webhook is what
  // actually activates the plan and un-pauses the hire, and it may not have
  // landed yet -- so this just closes the flow, and the webhook's own
  // first-activation resume covers the race either way.
  if (checkout === "success") await finishOnboarding();

  const state = await resolveOnboardingState(supabase);
  const back = redirectTargetFor(state, "plan");
  if (back) redirect(back);

  const [t, locale, { data: userRow }] = await Promise.all([
    getTranslations("Onboarding.plan"),
    getLocale(),
    supabase.from("users").select("trial_used_at").eq("id", user.id).maybeSingle(),
  ]);

  const money = new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
  const count = new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US");

  const plans: PlanOption[] = getSelfServePlans().map((plan) => ({
    key: plan.key,
    name: plan.displayName,
    priceLabel: t("perMonth", { price: money.format((plan.priceBrlCents ?? 0) / 100) }),
    replyLimit: t("replyLimit", { count: count.format(plan.monthlyReplyLimit ?? 0) }),
    features: [t("featureChannels"), t("featureTeam"), t("featureHistory")],
  }));

  const name = state.agentName ?? defaultAgentName(state.agentSlug!);

  return (
    <StepCard
      title={t("title", { name })}
      subtitle={t("subtitle", { name })}
      portrait={agentPhoto(state.agentSlug!)}
      portraitAlt={name}
    >
      <PlanPicker
        companyId={state.companyId!}
        plans={plans}
        trialDays={TRIAL_DAYS}
        trialAvailable={!(userRow as { trial_used_at: string | null } | null)?.trial_used_at}
        checkoutCancelled={checkout === "cancel"}
      />
    </StepCard>
  );
}
