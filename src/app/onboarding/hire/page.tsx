import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_PATHS, redirectTargetFor, resolveOnboardingState } from "@/lib/companies/onboarding-step";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentPhoto } from "@/lib/agents/media";
import { quizAgentSlug } from "@/lib/quiz/answers";
import { readQuizAnswers } from "@/lib/quiz/server";
import { StepCard } from "../step-card";
import { HirePicker, type HireableAgent } from "./hire-picker";

type AgentRow = { slug: string };

// The agents this step has copy for (`Onboarding.hire.options.<slug>`).
const PICKABLE = new Set(["ana", "malu"]);

export default async function OnboardingHirePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const state = await resolveOnboardingState(supabase);
  const back = redirectTargetFor(state, "hire");
  if (back) redirect(back);
  if (state.step !== "hire") redirect(ONBOARDING_PATHS[state.step]);

  const [t, quiz, { data: agentsRaw }] = await Promise.all([
    getTranslations("Onboarding.hire"),
    readQuizAnswers(user),
    // Ordered explicitly: card order decides which option a keyboard user
    // lands on first, and row order is not a design decision.
    supabase.from("agents").select("slug").eq("is_active", true).order("slug"),
  ]);

  const rows = (agentsRaw ?? []) as AgentRow[];
  const agents: HireableAgent[] = rows
    .filter((row) => PICKABLE.has(row.slug))
    .map((row) => ({ slug: row.slug, name: defaultAgentName(row.slug), photo: agentPhoto(row.slug) }));

  return (
    <StepCard title={t("title")} subtitle={t("subtitle")}>
      <HirePicker
        companyId={state.companyId!}
        agents={agents}
        initialSlug={quiz ? quizAgentSlug(quiz) : null}
      />
    </StepCard>
  );
}
