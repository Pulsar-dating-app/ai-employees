import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";

// Trello ticket B1 — agent-scalable by design even though the MVP only ever
// hires "malu": the agent is a URL segment (agentSlug), never hardcoded, so
// adding a second agent later needs no route changes, just a new agents row.

async function requireMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const { data: membership, error } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!membership) {
    return {
      error: NextResponse.json(
        { error: "Not a member of this company" },
        { status: 403 },
      ),
    };
  }

  return { error: null };
}

async function getAgentBySlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
) {
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!agent) {
    // Caller-supplied slug now that it's a URL param — a bad/unknown slug
    // is a client error, not a platform config problem.
    return {
      error: NextResponse.json({ error: "Agent not found" }, { status: 404 }),
    };
  }

  return { agentId: agent.id as string, agentSlug: agent.slug as string, error: null };
}

// GET: hire status for a specific agent. Used by F1's onboarding wizard to
// decide "Hire Malu" vs "Malu is ready."
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; agentSlug: string }> },
) {
  const { companyId, agentSlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const agentLookup = await getAgentBySlug(supabase, agentSlug);
  if (agentLookup.error) return agentLookup.error;

  const { data, error } = await supabase
    .from("company_agents")
    .select("*")
    .eq("company_id", companyId)
    .eq("agent_id", agentLookup.agentId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ companyAgent: data ?? null });
}

// POST: hire the agent named by agentSlug. Idempotent — calling this twice
// is a no-op, not an error. company_agents.status only has active/paused
// (no "hired" state — see decisions.md), so this inserts directly as active.
// Optional body: { name?: string } to override the default display name
// (company_agents.name is a per-company, merchant-editable label).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; agentSlug: string }> },
) {
  const { companyId, agentSlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const agentLookup = await getAgentBySlug(supabase, agentSlug);
  if (agentLookup.error) return agentLookup.error;

  const body = await request.json().catch(() => null);
  const name =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim()
      : defaultAgentName(agentLookup.agentSlug);

  const { data, error } = await supabase
    .from("company_agents")
    .insert({
      company_id: companyId,
      agent_id: agentLookup.agentId,
      name,
      status: "active",
      hired_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      // Already hired — fetch and return the existing row as a no-op.
      const { data: existing, error: fetchError } = await supabase
        .from("company_agents")
        .select("*")
        .eq("company_id", companyId)
        .eq("agent_id", agentLookup.agentId)
        .single();

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }

      return NextResponse.json({ companyAgent: existing }, { status: 200 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ companyAgent: data }, { status: 201 });
}
