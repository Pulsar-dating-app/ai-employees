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
    return { error: NextResponse.json({ error: error.message }, { status: 500 }), role: null };
  }

  if (!membership) {
    return {
      error: NextResponse.json(
        { error: "Not a member of this company" },
        { status: 403 },
      ),
      role: null,
    };
  }

  return { error: null, role: membership.role as string };
}

// PATCH (pause/activate a hire) is admin-gated at the app layer, matching the
// companies PATCH route and the old WhatsApp connect/disconnect: RLS still
// lets any member UPDATE company_agents, so this check is what actually keeps
// a plain member from silencing the team. Hiring (POST) stays member-level —
// unchanged.
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
        { error: "Only company owners/admins can change this" },
        { status: 403 },
      ),
      role: membership.role,
    };
  }

  return membership;
}

const VALID_STATUSES = ["active", "paused"] as const;

// company_agents.name is a plain varchar with no DB-level length cap; this is
// a sane display-name ceiling enforced at the API layer (and mirrored by the
// rename form's maxLength).
const MAX_NAME_LENGTH = 60;

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

// PATCH: update an already-hired team member. Merge-patch semantics (same as
// the companies PATCH route): send any subset of the writable fields, only
// those are touched.
//   - status: "active" | "paused" (Trello K6) — the only write path for
//     company_agents.status after the initial hire. Pausing sets the whole
//     hire off: M3's chat route (and any future channel) gates on
//     status === "active", so a paused hire stops answering customers
//     everywhere.
//   - name: the per-company display name (company_agents.name) — lets a
//     merchant rename a team member after hiring, shown across the dashboard,
//     the hosted chat page, and the conversations inbox.
// At least one field is required (an empty body is a 400). Not a router:
// sibling hires are untouched. No schema change.
export async function PATCH(
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

  const adminCheck = await requireAdmin(supabase, companyId, user.id);
  if (adminCheck.error) return adminCheck.error;

  const agentLookup = await getAgentBySlug(supabase, agentSlug);
  if (agentLookup.error) return agentLookup.error;

  const body = await request.json().catch(() => null);
  const updates: { status?: string; name?: string } = {};

  if (body?.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    updates.status = body.status;
  }

  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `name must be at most ${MAX_NAME_LENGTH} characters` },
        { status: 400 },
      );
    }
    updates.name = name;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Provide at least one of: status, name" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("company_agents")
    .update(updates)
    .eq("company_id", companyId)
    .eq("agent_id", agentLookup.agentId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Can't pause/activate a hire that was never made — caller-supplied slug,
  // so a miss is a client error (same reasoning as the 404 on unknown slug).
  if (!data) {
    return NextResponse.json(
      { error: "This team member hasn't been hired" },
      { status: 404 },
    );
  }

  return NextResponse.json({ companyAgent: data });
}
