import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Trello N2 -- Instagram connection status/lifecycle for one hired agent.
// The actual "connect" action lives in ./connect/route.ts (it needs the
// Meta round trip); this file is the simpler read/disconnect pair, a direct
// structural copy of D1's whatsapp/route.ts.
//
// Nested under [agentSlug], unlike D1's whatsapp routes: N1 keyed
// company_instagram_connections per (company_id, agent_id), not per
// company, so every operation here needs the agent resolved first.
//
// company_instagram_connections.access_token is column-privilege-locked
// (migration 20260831140200) -- every select below lists safe columns
// explicitly and must never include it for a regular (non-service) client.
const SAFE_COLUMNS = "instagram_user_id, username, status, connected_at, token_expires_at";

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
    return { error: NextResponse.json({ error: error.message }, { status: 500 }), role: null };
  }

  if (!membership) {
    return {
      error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }),
      role: null,
    };
  }

  return { error: null, role: membership.role as string };
}

async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const membership = await requireMember(supabase, companyId, userId);
  if (membership.error) return membership;

  if (!["owner", "admin"].includes(membership.role!)) {
    return {
      error: NextResponse.json(
        { error: "Only company owners/admins can manage the Instagram connection" },
        { status: 403 },
      ),
      role: membership.role,
    };
  }

  return membership;
}

async function resolveAgentId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  agentSlug: string,
) {
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("slug", agentSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (agentError) {
    return { error: NextResponse.json({ error: agentError.message }, { status: 500 }), agentId: null };
  }
  if (!agent) {
    return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }), agentId: null };
  }

  const { data: companyAgent, error: companyAgentError } = await supabase
    .from("company_agents")
    .select("id")
    .eq("company_id", companyId)
    .eq("agent_id", agent.id)
    .maybeSingle();
  if (companyAgentError) {
    return { error: NextResponse.json({ error: companyAgentError.message }, { status: 500 }), agentId: null };
  }
  if (!companyAgent) {
    return {
      error: NextResponse.json({ error: "This company hasn't hired this agent" }, { status: 400 }),
      agentId: null,
    };
  }

  return { error: null, agentId: agent.id as string };
}

// GET: any company member can see connection status + the merchant-facing
// @username -- the access_token column is never selected here.
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

  const agentCheck = await resolveAgentId(supabase, companyId, agentSlug);
  if (agentCheck.error) return agentCheck.error;

  const { data, error } = await supabase
    .from("company_instagram_connections")
    .select(SAFE_COLUMNS)
    .eq("company_id", companyId)
    .eq("agent_id", agentCheck.agentId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection: data ?? null });
}

// DELETE: admin-only disconnect. Flips status and clears the token
// (nullable) rather than deleting the row, so history stays visible and the
// account is freed for the account-uniqueness index -- a no-op (200,
// connection: null) if nothing was ever connected, matching this codebase's
// idempotent-on-repeat convention. Goes through the service client:
// access_token is column-privilege-locked for the regular admin client, so
// nulling it out requires bypassing that grant.
export async function DELETE(
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

  const adminCheck = await requireAdmin(supabase, companyId, user.id);
  if (adminCheck.error) return adminCheck.error;

  const agentCheck = await resolveAgentId(supabase, companyId, agentSlug);
  if (agentCheck.error) return agentCheck.error;

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("company_instagram_connections")
    .update({ status: "disconnected", access_token: null, token_expires_at: null })
    .eq("company_id", companyId)
    .eq("agent_id", agentCheck.agentId)
    .select(SAFE_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection: data ?? null });
}
