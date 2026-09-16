import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_PATHS, redirectTargetFor, resolveOnboardingState } from "@/lib/companies/onboarding-step";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentDescription } from "@/lib/agents/copy";
import { agentPhoto } from "@/lib/agents/media";
import { StepCard } from "../step-card";
import { HirePicker, type HireableAgent } from "./hire-picker";

type AgentRow = { id: string; slug: string; role: string | null; description: string | null };

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

  const [t, { data: agentsRaw }] = await Promise.all([
    getTranslations("Onboarding.hire"),
    // Ordered explicitly: card order decides which option a keyboard user
    // lands on first, and row order is not a design decision.
    supabase.from("agents").select("id, slug, role, description").eq("is_active", true).order("slug"),
  ]);

  const rows = (agentsRaw ?? []) as AgentRow[];
  const agents: HireableAgent[] = await Promise.all(
    rows.map(async (row) => {
      const name = defaultAgentName(row.slug);
      return {
        slug: row.slug,
        name,
        role: row.role ?? "",
        blurb: await resolveAgentDescription(row.slug, row.description, name),
        photo: agentPhoto(row.slug),
      };
    }),
  );

  return (
    <StepCard title={t("title", { company: state.companyName ?? "" })} subtitle={t("subtitle")}>
      <HirePicker companyId={state.companyId!} agents={agents} />
    </StepCard>
  );
}
