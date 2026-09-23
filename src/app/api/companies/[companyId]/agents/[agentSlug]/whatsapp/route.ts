import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteSender, fetchSender } from "@/lib/whatsapp/twilio/api";
import { getCompanyTwilioAccount } from "@/lib/whatsapp/twilio/accounts";
import { syncTwilioSender } from "@/lib/whatsapp/twilio/sync";

// Trello D1 amendment (2026-09-04) -- WhatsApp connection status/lifecycle
// for one hired agent. The actual "connect" action lives in
// ./connect/route.ts (it needs the Meta Graph API round trip); this file is
// the simpler read/disconnect pair, a direct structural copy of
// Instagram's agents/[agentSlug]/instagram/route.ts (N2).
//
// Nested under [agentSlug], unlike D1's original company-wide routes:
// migration 20260905090000 made company_whatsapp_connections per-agent
// (unique(company_id, agent_id)), mirroring N1's Instagram departure, so
// every operation here needs the agent resolved first.
//
// company_whatsapp_connections.access_token (and two_step_pin) are
// column-privilege-locked -- every select below lists safe columns
// explicitly and must never include them for a regular (non-service) client.
const SAFE_COLUMNS =
  "provider, phone_number_id, phone_e164, waba_id, display_phone_number, status, connected_at, token_expires_at, has_payment_issue, payment_issue_detected_at, sender_status, quality_rating, messaging_limit, last_synced_at";

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
        { error: "Only company owners/admins can manage the WhatsApp connection" },
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
// phone number -- the access_token column is never selected here.
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

  const readConnection = () =>
    supabase
      .from("company_whatsapp_connections")
      .select(SAFE_COLUMNS)
      .eq("company_id", companyId)
      .eq("agent_id", agentCheck.agentId)
      .maybeSingle();

  let { data, error } = await readConnection();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A Twilio sender is registered asynchronously (Meta reviews the display
  // name for minutes to hours). While the merchant is looking at a pending
  // connection, refresh it from Twilio on demand instead of waiting for the
  // 15-minute sync cron. Best-effort: a Twilio hiccup must not turn a status
  // read into a 500.
  const row = data as unknown as { provider?: string; status?: string } | null;
  if (row?.provider === "twilio" && row.status === "pending") {
    try {
      if (await refreshPendingTwilioSender(companyId, agentCheck.agentId)) {
        ({ data, error } = await readConnection());
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } catch (err) {
      console.error("WhatsApp status: Twilio sender refresh failed", err);
    }
  }

  return NextResponse.json({ connection: data ?? null });
}

async function refreshPendingTwilioSender(companyId: string, agentId: string) {
  const service = createServiceClient();
  const { data: conn } = await service
    .from("company_whatsapp_connections")
    .select("id, twilio_sender_sid")
    .eq("company_id", companyId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!conn?.twilio_sender_sid) return false;
  const account = await getCompanyTwilioAccount(service, companyId);
  if (!account) return false;
  const sender = await fetchSender(account, conn.twilio_sender_sid as string);
  await syncTwilioSender(service, conn.id as string, sender);
  return true;
}

// DELETE: admin-only disconnect. Flips status and clears the token
// (nullable) rather than deleting the row, so history stays visible and the
// number is freed for the account-uniqueness index -- a no-op (200,
// connection: null) if nothing was ever connected. Goes through the service
// client: access_token is column-privilege-locked for the regular admin
// client, so nulling it out requires bypassing that grant.
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

  // A Twilio connection must give the sender back to Twilio too -- otherwise
  // it keeps receiving messages and the WABA stays bound to this subaccount.
  // Done first and NOT best-effort: if Twilio can't delete it, telling the
  // merchant "disconnected" while the number still answers is worse than an
  // error they can retry.
  const { data: existing } = await serviceClient
    .from("company_whatsapp_connections")
    .select("provider, status, twilio_sender_sid")
    .eq("company_id", companyId)
    .eq("agent_id", agentCheck.agentId)
    .maybeSingle();
  if (existing?.provider === "twilio" && existing.status !== "disconnected" && existing.twilio_sender_sid) {
    try {
      const account = await getCompanyTwilioAccount(serviceClient, companyId);
      if (account) await deleteSender(account, existing.twilio_sender_sid as string);
    } catch (err) {
      console.error("WhatsApp disconnect: Twilio sender delete failed", err);
      return NextResponse.json({ error: "Failed to disconnect WhatsApp" }, { status: 502 });
    }
  }

  const { data, error } = await serviceClient
    .from("company_whatsapp_connections")
    .update({
      status: "disconnected",
      access_token: null,
      token_expires_at: null,
      twilio_sender_sid: null,
      sender_status: null,
    })
    .eq("company_id", companyId)
    .eq("agent_id", agentCheck.agentId)
    .select(SAFE_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection: data ?? null });
}
