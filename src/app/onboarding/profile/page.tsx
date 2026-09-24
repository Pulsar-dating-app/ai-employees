import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_PATHS, resolveOnboardingState } from "@/lib/companies/onboarding-step";
import { StepCard } from "../step-card";
import { ProfileForm } from "./profile-form";

// Step 0: the person's own name. Also where the dashboard shell sends any
// account without one (see dashboard/layout.tsx), including owners who
// onboarded before this step existed.
export default async function OnboardingProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const state = await resolveOnboardingState(supabase);
  if (state.step !== "profile") redirect(ONBOARDING_PATHS[state.step]);

  const t = await getTranslations("Onboarding.profile");

  return (
    <StepCard title={t("title")} subtitle={t("subtitle")}>
      <ProfileForm />
    </StepCard>
  );
}
