import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { claimPendingInvite } from "@/lib/team/invites";
import { pendingRemovalNotice } from "@/lib/team/roles";
import { ONBOARDING_PATHS, resolveOnboardingState } from "@/lib/companies/onboarding-step";
import { OnboardingForm } from "./onboarding-form";
import { StepCard } from "./step-card";

// Step 1 of the first session, and the only place a company is created. The
// dashboard shell redirects a company-less account here.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // An invited professional joins the company that added them, never this
  // flow.
  if (await claimPendingInvite(user)) redirect("/dashboard");
  if (await pendingRemovalNotice(supabase, user.id)) redirect("/access-removed");

  const state = await resolveOnboardingState(supabase);
  if (state.step !== "company") redirect(ONBOARDING_PATHS[state.step]);

  const t = await getTranslations("Onboarding");

  return (
    <StepCard title={t("title")} subtitle={t("subtitle")}>
      <OnboardingForm />
    </StepCard>
  );
}
