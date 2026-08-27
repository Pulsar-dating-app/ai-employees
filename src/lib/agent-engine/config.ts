import type { SupabaseClient } from "@supabase/supabase-js";
import { AgentUnavailableError } from "./errors";

export type AgentConfig = {
  slug: string;
  role: string | null;
  description: string | null;
  personality: string | null;
  systemPrompt: string | null;
  companyAgentStatus: string | null;
};

// Step 1 -- loads the platform-defined `agents` row plus this company's
// `company_agents` hire row. `company_agents.status` (hired/active/paused)
// is loaded but NOT enforced here -- deciding whether to invoke the engine
// at all for a paused agent is the future caller's (D2's) job, not this
// skeleton's. system_prompt/personality are frequently NULL today (C2
// hasn't populated them yet) -- callers (see prompt.ts) must tolerate that.
export async function loadAgentConfig(
  supabase: SupabaseClient,
  { companyId, agentId }: { companyId: string; agentId: string },
): Promise<AgentConfig> {
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("slug, role, description, personality, system_prompt, is_active")
    .eq("id", agentId)
    .maybeSingle();
  if (agentError) throw agentError;
  if (!agent || !agent.is_active) {
    throw new AgentUnavailableError(`agent ${agentId} is missing or inactive`);
  }

  const { data: companyAgent, error: companyAgentError } = await supabase
    .from("company_agents")
    .select("status")
    .eq("company_id", companyId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (companyAgentError) throw companyAgentError;
  if (!companyAgent) {
    throw new AgentUnavailableError(`agent ${agentId} was never hired by company ${companyId}`);
  }

  return {
    slug: agent.slug,
    role: agent.role,
    description: agent.description,
    personality: agent.personality,
    systemPrompt: agent.system_prompt,
    companyAgentStatus: companyAgent.status,
  };
}
