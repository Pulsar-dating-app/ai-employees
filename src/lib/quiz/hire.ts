import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultAgentName } from "@/lib/agents/naming";

// A merchant who came through /comecar already told us their business, which
// is what picks the hire (quizAgentSlug). Onboarding hires that agent right
// after the company is created and skips the hire step, rather than asking
// again. Same insert as POST /api/companies/[id]/agents/[slug], with the
// caller's own client so RLS decides who may hire into the company.
//
// `true` once the agent is hired (or already was); `false` sends the caller
// back to the normal hire step, which still pre-selects the quiz's agent.
export async function hireQuizAgent(
  supabase: SupabaseClient,
  companyId: string,
  agentSlug: string,
): Promise<boolean> {
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("slug", agentSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (!agent) return false;

  const { error } = await supabase.from("company_agents").insert({
    company_id: companyId,
    agent_id: (agent as { id: string }).id,
    name: defaultAgentName(agentSlug),
    status: "active",
    hired_at: new Date().toISOString(),
  });
  if (!error || error.code === "23505") return true;

  console.error("[onboarding] hiring the quiz's agent failed", { code: error.code, message: error.message });
  return false;
}
