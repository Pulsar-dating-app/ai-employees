import { createServiceClient } from "@/lib/supabase/service";
import { defaultAgentName } from "@/lib/agents/naming";

export type PublicAgent = {
  slug: string;
  name: string;
  role: string | null;
  description: string | null;
};

// The public roster, pulled live — never a hardcoded or fictional lineup
// (see decisions.md's 2026-08-26 entry on that exact mistake in the
// dashboard marketplace).
//
// Uses the service client, not the regular RLS-scoped one: `agents`' RLS
// policy grants SELECT to `authenticated` only, and this page renders for
// anonymous visitors, so the regular client would silently return zero rows
// here. Same reasoning as ProductRepository (B5) — a caller with no session
// reading data that is meant to be public. `is_active` is filtered in
// application code since RLS is no longer doing it.
export async function fetchPublicAgents(): Promise<PublicAgent[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("agents")
    .select("slug, role, description")
    .eq("is_active", true)
    .order("created_at");

  return (data ?? []).map((agent) => ({
    slug: agent.slug as string,
    name: defaultAgentName(agent.slug as string),
    role: agent.role as string | null,
    description: agent.description as string | null,
  }));
}
