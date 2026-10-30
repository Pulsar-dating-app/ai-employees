import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirectTargetFor, resolveOnboardingState } from "@/lib/companies/onboarding-step";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentPhoto } from "@/lib/agents/media";
import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";
import { findPlan } from "@/lib/billing/plans";
import { StepCard } from "../step-card";
import { GoLive } from "./go-live";

// The last step: put her where customers can reach her. Until 2026-10-26 the
// flow ended in the dashboard, with "connect a channel" last on a checklist,
// and not one ad sign-up ever got a real conversation. The hosted link leads
// because it works the moment it is shared, with nothing to connect;
// Instagram and WhatsApp follow, each a hand-off to its own setup.
export default async function OnboardingLivePage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const [{ checkout }, supabase] = await Promise.all([searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const state = await resolveOnboardingState(supabase);
  // Three ways in from an earlier step: back from choosing a plan (a paid one
  // may still be waiting on its webhook, so the state can still say "plan"),
  // the proof's "test it later" and the services step's "set this up later",
  // both when a plan is already active.
  const earlyEntry =
    (state.step === "plan" && checkout === "success") ||
    (state.step === "ready" && state.planActive) ||
    (state.step === "setup" && state.agentSlug === "ana" && state.planActive);
  const back = earlyEntry ? null : redirectTargetFor(state, "live");
  if (back) redirect(back);

  const [t, { data: company }, { data: billing }] = await Promise.all([
    getTranslations("Onboarding.live"),
    supabase.from("companies").select("slug, name").eq("id", state.companyId!).maybeSingle(),
    supabase.from("company_billing").select("plan_key").eq("company_id", state.companyId!).maybeSingle(),
  ]);

  const slug = state.agentSlug!;
  const name = state.agentName ?? defaultAgentName(slug);
  const companyRow = company as { slug: string; name: string } | null;
  const chatUrl = `${resolveCheckoutBaseUrl()}/talk/${companyRow?.slug ?? ""}/${slug}`;

  return (
    <StepCard title={t("title", { name })} subtitle={t("subtitle", { name })} portrait={agentPhoto(slug)} portraitAlt={name}>
      <GoLive
        agentSlug={slug}
        agentName={name}
        companyName={companyRow?.name ?? state.companyName ?? ""}
        chatUrl={chatUrl}
        whatsappIncluded={findPlan((billing as { plan_key: string | null } | null)?.plan_key)?.whatsappIncluded === true}
      />
    </StepCard>
  );
}
