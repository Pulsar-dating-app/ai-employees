import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  deleteWhatsappSender,
  fetchWhatsappSender,
  submitWhatsappSenderVerificationCode,
  TWILIO_SENDER_ONLINE,
  TWILIO_SENDER_PENDING_VERIFICATION,
} from "@/lib/whatsapp/twilio-api";
import { getCompanyTwilioCredentials } from "@/lib/whatsapp/twilio-subaccounts";

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
  "phone_number_id, waba_id, display_phone_number, status, connected_at, token_expires_at, has_payment_issue, payment_issue_detected_at, provider, twilio_sender_status";

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

  const { data, error } = await supabase
    .from("company_whatsapp_connections")
    .select(SAFE_COLUMNS)
    .eq("company_id", companyId)
    .eq("agent_id", agentCheck.agentId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.provider === "twilio" && data.status === "pending") {
    const refreshed = await refreshPendingTwilioSender(companyId, agentCheck.agentId!);
    if (refreshed) return NextResponse.json({ connection: refreshed });
  }

  return NextResponse.json({ connection: data ?? null });
}

async function refreshPendingTwilioSender(companyId: string, agentId: string) {
  const serviceClient = createServiceClient();
  const { data: row } = await serviceClient
    .from("company_whatsapp_connections")
    .select("twilio_sender_sid, twilio_sender_status")
    .eq("company_id", companyId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!row?.twilio_sender_sid) return null;

  try {
    const credentials = await getCompanyTwilioCredentials(serviceClient, companyId);
    if (!credentials) return null;
    const sender = await fetchWhatsappSender(credentials, row.twilio_sender_sid);
    if (sender.status === row.twilio_sender_status) return null;

    const isOnline = sender.status === TWILIO_SENDER_ONLINE;
    const { data } = await serviceClient
      .from("company_whatsapp_connections")
      .update({
        twilio_sender_status: sender.status,
        ...(isOnline ? { status: "connected", connected_at: new Date().toISOString() } : {}),
      })
      .eq("company_id", companyId)
      .eq("agent_id", agentId)
      .eq("status", "pending")
      .select(SAFE_COLUMNS)
      .maybeSingle();
    return data;
  } catch (err) {
    console.error("WhatsApp status: Twilio sender refresh failed", err);
    return null;
  }
}

const VERIFICATION_CODE_PATTERN = /^\d{4,8}$/;

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

  const agentCheck = await resolveAgentId(supabase, companyId, agentSlug);
  if (agentCheck.error) return agentCheck.error;

  const body = await request.json().catch(() => null);
  const verificationCode = typeof body?.verificationCode === "string" ? body.verificationCode.trim() : "";
  if (!VERIFICATION_CODE_PATTERN.test(verificationCode)) {
    return NextResponse.json({ error: "invalid_verification_code" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data: row, error: rowError } = await serviceClient
    .from("company_whatsapp_connections")
    .select("provider, status, twilio_sender_sid, twilio_sender_status")
    .eq("company_id", companyId)
    .eq("agent_id", agentCheck.agentId)
    .maybeSingle();
  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }
  if (
    row?.provider !== "twilio" ||
    row.status !== "pending" ||
    row.twilio_sender_status !== TWILIO_SENDER_PENDING_VERIFICATION ||
    !row.twilio_sender_sid
  ) {
    return NextResponse.json({ error: "verification_not_pending" }, { status: 409 });
  }

  let senderStatus: string;
  try {
    const credentials = await getCompanyTwilioCredentials(serviceClient, companyId);
    if (!credentials) throw new Error("Company has no Twilio subaccount");
    ({ status: senderStatus } = await submitWhatsappSenderVerificationCode(
      credentials,
      row.twilio_sender_sid,
      verificationCode,
    ));
  } catch (err) {
    console.error("WhatsApp verify: Twilio rejected the verification code", err);
    return NextResponse.json({ error: "verification_failed" }, { status: 502 });
  }

  const isOnline = senderStatus === TWILIO_SENDER_ONLINE;
  const { data, error } = await serviceClient
    .from("company_whatsapp_connections")
    .update({
      twilio_sender_status: senderStatus,
      ...(isOnline ? { status: "connected", connected_at: new Date().toISOString() } : {}),
    })
    .eq("company_id", companyId)
    .eq("agent_id", agentCheck.agentId)
    .select(SAFE_COLUMNS)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection: data });
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
  const { data: existing } = await serviceClient
    .from("company_whatsapp_connections")
    .select("provider, twilio_sender_sid, status")
    .eq("company_id", companyId)
    .eq("agent_id", agentCheck.agentId)
    .maybeSingle();

  if (existing?.provider === "twilio" && existing.twilio_sender_sid && existing.status !== "disconnected") {
    try {
      const credentials = await getCompanyTwilioCredentials(serviceClient, companyId);
      if (credentials) await deleteWhatsappSender(credentials, existing.twilio_sender_sid);
    } catch (err) {
      console.error("WhatsApp disconnect: Twilio sender deletion failed", err);
      return NextResponse.json({ error: "Failed to disconnect WhatsApp" }, { status: 502 });
    }
  }

  const { data, error } = await serviceClient
    .from("company_whatsapp_connections")
    .update({ status: "disconnected", access_token: null, token_expires_at: null, twilio_sender_sid: null })
    .eq("company_id", companyId)
    .eq("agent_id", agentCheck.agentId)
    .select(SAFE_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection: data ?? null });
}
