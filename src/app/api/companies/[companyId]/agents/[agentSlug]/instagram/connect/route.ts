import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { connectInstagramAccount } from "@/lib/instagram/meta-instagram-api";

// Trello N2 -- finishes what Business Login for Instagram starts. N3's
// callback route (src/app/dashboard/my-agents/instagram-callback/route.ts)
// redirects the merchant through buildAuthorizeUrl() and, on return, POSTs
// the resulting `code` here. This route does the server-to-server work:
// exchange the code for a long-lived access token, subscribe our app to the
// account's message webhooks (so N4's inbound webhook has something to
// receive), and persist the result. redirect_uri itself is never a
// parameter here -- meta-instagram-api.ts always resolves it to the one
// shared callback URL (instagramCallbackUrl()), since Meta requires it to
// exactly match what was used to obtain the code, and with a single shared
// callback there is only ever one correct value.
const SAFE_COLUMNS = "instagram_user_id, username, status, connected_at, token_expires_at";

async function requireAdmin(
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

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!membership) {
    return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }) };
  }
  if (!["owner", "admin"].includes(membership.role)) {
    return {
      error: NextResponse.json(
        { error: "Only company owners/admins can manage the Instagram connection" },
        { status: 403 },
      ),
    };
  }
  return { error: null };
}

async function resolveAgent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  agentSlug: string,
) {
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, slug")
    .eq("slug", agentSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (agentError) return { error: NextResponse.json({ error: agentError.message }, { status: 500 }), agent: null };
  if (!agent) return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }), agent: null };

  const { data: companyAgent, error: companyAgentError } = await supabase
    .from("company_agents")
    .select("id")
    .eq("company_id", companyId)
    .eq("agent_id", agent.id)
    .maybeSingle();
  if (companyAgentError) {
    return { error: NextResponse.json({ error: companyAgentError.message }, { status: 500 }), agent: null };
  }
  if (!companyAgent) {
    return {
      error: NextResponse.json({ error: "This company hasn't hired this agent" }, { status: 400 }),
      agent: null,
    };
  }

  return { error: null, agent };
}

// POST: admin-only. Body: { code, force? }. Upserts on
// (company_id, agent_id), so reconnecting is idempotent -- same convention
// as D1's connect route.
//
// One Instagram account answers exactly one agent platform-wide (N1's
// partial unique index). Two conflict shapes follow from that:
//   - the account is already held by a DIFFERENT agent in THIS company:
//     with force=true, that connection is released first and this one
//     takes it over -- an admin moving their own asset between their own
//     hires is safe to do in one step. Without force, this comes back as a
//     409 naming who holds it, so N3 can ask for confirmation first.
//   - the account is held by ANOTHER company entirely: always a 409, never
//     auto-resolved -- that would mean silently reassigning someone else's
//     connected account.
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

  const adminCheck = await requireAdmin(supabase, companyId, user.id);
  if (adminCheck.error) return adminCheck.error;

  const agentCheck = await resolveAgent(supabase, companyId, agentSlug);
  if (agentCheck.error) return agentCheck.error;
  const agent = agentCheck.agent!;

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const force = body?.force === true;

  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  let instagramUserId: string;
  let username: string | null;
  let accessToken: string;
  let tokenExpiresAt: string | null;
  try {
    ({ instagramUserId, username, accessToken, tokenExpiresAt } = await connectInstagramAccount(code));
  } catch {
    // Never leak Meta's raw error text to the merchant-facing UI.
    return NextResponse.json({ error: "Failed to connect Instagram" }, { status: 502 });
  }

  const serviceClient = createServiceClient();

  // Check for a live holder of this account before writing -- turns the
  // unique-index violation into an answer the UI can act on, rather than a
  // raw 23505 surfacing as a 500.
  const { data: holder, error: holderError } = await serviceClient
    .from("company_instagram_connections")
    .select("id, company_id, agent_id")
    .eq("instagram_user_id", instagramUserId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (holderError) {
    return NextResponse.json({ error: holderError.message }, { status: 500 });
  }

  if (holder && holder.company_id !== companyId) {
    // Different company. Never auto-resolved regardless of `force` --
    // resolving it would mean reassigning an account this caller doesn't
    // own. No detail about the other company is returned.
    return NextResponse.json(
      { error: "instagram_account_connected_elsewhere" },
      { status: 409 },
    );
  }

  if (holder && holder.agent_id !== agent.id) {
    if (!force) {
      const { data: holdingAgent } = await supabase.from("agents").select("slug").eq("id", holder.agent_id).maybeSingle();
      return NextResponse.json(
        {
          error: "instagram_account_connected_to_other_agent",
          agentSlug: holdingAgent?.slug ?? null,
        },
        { status: 409 },
      );
    }

    const { error: releaseError } = await serviceClient
      .from("company_instagram_connections")
      .update({ status: "disconnected", access_token: null, token_expires_at: null })
      .eq("id", holder.id);
    if (releaseError) {
      return NextResponse.json({ error: releaseError.message }, { status: 500 });
    }
  }

  const { data: connection, error } = await serviceClient
    .from("company_instagram_connections")
    .upsert(
      {
        company_id: companyId,
        agent_id: agent.id,
        instagram_user_id: instagramUserId,
        username,
        status: "connected",
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "company_id,agent_id" },
    )
    .select(SAFE_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection });
}
