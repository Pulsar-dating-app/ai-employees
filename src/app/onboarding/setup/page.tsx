import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirectTargetFor, resolveOnboardingState } from "@/lib/companies/onboarding-step";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentPhoto } from "@/lib/agents/media";
import { quizServiceTrade } from "@/lib/quiz/answers";
import { readQuizAnswers } from "@/lib/quiz/server";
import { StepCard } from "../step-card";
import { CatalogSetup } from "./catalog-setup";
import { ServicesSetup } from "./services-setup";

// Step 3, and the one that forks. "Bring your catalogue" is only half the
// product: a scheduling hire has no catalogue, she has services and opening
// hours. What both branches share is the shape of the ask -- give her the one
// thing she needs before she can do the job at all.
export default async function OnboardingSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const state = await resolveOnboardingState(supabase);
  const back = redirectTargetFor(state, "setup");
  if (back) redirect(back);

  const slug = state.agentSlug!;
  const name = state.agentName ?? defaultAgentName(slug);
  const isScheduling = slug === "ana";

  const [t, quiz] = await Promise.all([
    getTranslations(isScheduling ? "Onboarding.setup.services" : "Onboarding.setup.catalog"),
    readQuizAnswers(user),
  ]);

  return (
    <StepCard
      title={t("title", { name })}
      subtitle={t("subtitle", { name })}
      portrait={agentPhoto(slug)}
      portraitAlt={name}
    >
      {isScheduling ? (
        <ServicesSetup
          companyId={state.companyId!}
          agentName={name}
          initialTrade={quiz ? quizServiceTrade(quiz) : null}
          planActive={state.planActive}
        />
      ) : (
        <CatalogSetup companyId={state.companyId!} agentName={name} />
      )}
    </StepCard>
  );
}
