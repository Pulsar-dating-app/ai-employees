import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exchangeCodeForToken, lookupDisplayPhoneNumber } from "@/lib/whatsapp/meta-graph-api";
import {
  createWhatsappSender,
  fetchWhatsappSender,
  toWhatsappSenderId,
  TWILIO_SENDER_ONLINE,
  TWILIO_WHATSAPP_WEBHOOK_PATH,
  type TwilioCredentials,
  type TwilioSender,
} from "@/lib/whatsapp/twilio-api";
import { ensureCompanyTwilioCredentials } from "@/lib/whatsapp/twilio-subaccounts";
import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";
import { decideWhatsappPlanGate } from "@/lib/whatsapp/enforcement";
import { findPlan } from "@/lib/billing/plans";

// Trello D1 amendment (2026-09-04) -- finishes what Meta's Embedded Signup
// starts, now nested under [agentSlug] since migration 20260905090000 made
// company_whatsapp_connections per-agent. D6's dashboard card loads the
// Facebook JS SDK and triggers the popup on this agent's page; on success
// the browser gets { code, waba_id, phone_number_id } and posts it here.
// Since 2026-09-25 the number is registered through Twilio's Partner
// Solution (see decisions.md): exchange the code only to read the display
// number, then register it as a Twilio sender under the company's
// subaccount. Twilio owns /register and the WABA webhooks now.
//
// One WhatsApp number answers exactly one agent, platform-wide (the partial
// unique index on phone_number_id). Same two conflict shapes N2 handles for
// Instagram accounts:
//   - the number is already held by a DIFFERENT agent in THIS company: with
//     force=true, that connection is released first and this one takes it
//     over -- an admin moving their own asset between their own hires is
//     safe to do in one step. Without force, a 409 names who holds it.
//   - the number is held by ANOTHER company entirely: always a 409, never
//     auto-resolved -- that would mean reassigning something this caller
//     doesn't own.
const SAFE_COLUMNS =
  "phone_number_id, waba_id, display_phone_number, status, connected_at, token_expires_at, has_payment_issue, payment_issue_detected_at, is_coexistence, provider, twilio_sender_status";

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
        { error: "Only company owners/admins can manage the WhatsApp connection" },
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

// POST: admin-only. Body: { code, phoneNumberId, wabaId, force? } -- exactly
// what Embedded Signup hands the browser on success, plus the same `force`
// flag N2 introduced. Upserts on (company_id, agent_id), so reconnecting is
// idempotent -- same convention as D1's original route.
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
  const phoneNumberId = typeof body?.phoneNumberId === "string" ? body.phoneNumberId : "";
  const wabaId = typeof body?.wabaId === "string" ? body.wabaId : "";
  const force = body?.force === true;
  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json({ error: "code, phoneNumberId and wabaId are required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  // 2026-09-22 -- WhatsApp is a paid add-on (a `_wpp` plan variant,
  // plans.ts), not something every subscriber gets. Checked here, after
  // body validation (so a malformed request still 400s the same way
  // regardless of plan) but before any Meta call is made -- connecting a
  // number this company isn't entitled to costs nothing to reject early.
  const { data: billing } = await serviceClient
    .from("company_billing")
    .select("plan_key, subscription_status")
    .eq("company_id", companyId)
    .maybeSingle();
  const planGate = decideWhatsappPlanGate({
    subscription_status: (billing?.subscription_status as string | null) ?? null,
    whatsappIncluded: findPlan(billing?.plan_key as string | null)?.whatsappIncluded === true,
  });
  if (!planGate.allow) {
    return NextResponse.json({ error: "whatsapp_addon_required" }, { status: 403 });
  }

  let accessToken: string;
  let tokenExpiresAt: string | null;
  let displayPhoneNumber: string | null;
  try {
    ({ accessToken, tokenExpiresAt } = await exchangeCodeForToken(code));
    displayPhoneNumber = await lookupDisplayPhoneNumber(accessToken, phoneNumberId);
  } catch {
    return NextResponse.json({ error: "Failed to connect WhatsApp" }, { status: 502 });
  }
  if (!displayPhoneNumber) {
    return NextResponse.json({ error: "Failed to connect WhatsApp" }, { status: 502 });
  }
  const senderId = toWhatsappSenderId(displayPhoneNumber);

  const { data: holder, error: holderError } = await serviceClient
    .from("company_whatsapp_connections")
    .select("id, company_id, agent_id, twilio_sender_sid, twilio_sender_id")
    .eq("phone_number_id", phoneNumberId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (holderError) {
    return NextResponse.json({ error: holderError.message }, { status: 500 });
  }

  if (holder && holder.company_id !== companyId) {
    return NextResponse.json({ error: "whatsapp_number_connected_elsewhere" }, { status: 409 });
  }

  if (holder && holder.agent_id !== agent.id) {
    if (!force) {
      const { data: holdingAgent } = await supabase.from("agents").select("slug").eq("id", holder.agent_id).maybeSingle();
      return NextResponse.json(
        { error: "whatsapp_number_connected_to_other_agent", agentSlug: holdingAgent?.slug ?? null },
        { status: 409 },
      );
    }

    const { error: releaseError } = await serviceClient
      .from("company_whatsapp_connections")
      .update({ status: "disconnected", access_token: null, token_expires_at: null })
      .eq("id", holder.id);
    if (releaseError) {
      return NextResponse.json({ error: releaseError.message }, { status: 500 });
    }
  }

  const { data: company } = await serviceClient.from("companies").select("name").eq("id", companyId).maybeSingle();

  let sender: TwilioSender;
  try {
    const credentials = await ensureCompanyTwilioCredentials(
      serviceClient,
      companyId,
      `Staffra - ${company?.name ?? companyId}`.slice(0, 64),
    );
    const reusableSid = holder?.twilio_sender_id === senderId ? holder.twilio_sender_sid : null;
    sender = await registerSender(credentials, reusableSid, {
      senderId,
      wabaId,
      callbackUrl: `${resolveCheckoutBaseUrl()}${TWILIO_WHATSAPP_WEBHOOK_PATH}`,
    });
  } catch (err) {
    console.error("WhatsApp connect: Twilio sender registration failed", err);
    return NextResponse.json({ error: "Failed to connect WhatsApp" }, { status: 502 });
  }

  const isOnline = sender.status === TWILIO_SENDER_ONLINE;
  const { data: connection, error } = await serviceClient
    .from("company_whatsapp_connections")
    .upsert(
      {
        company_id: companyId,
        agent_id: agent.id,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        display_phone_number: displayPhoneNumber,
        status: isOnline ? "connected" : "pending",
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        two_step_pin: null,
        connected_at: isOnline ? new Date().toISOString() : null,
        has_payment_issue: false,
        payment_issue_detected_at: null,
        is_coexistence: false,
        provider: "twilio",
        twilio_sender_sid: sender.sid,
        twilio_sender_id: sender.senderId,
        twilio_sender_status: sender.status,
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

async function registerSender(
  credentials: TwilioCredentials,
  reusableSid: string | null,
  input: { senderId: string; wabaId: string; callbackUrl: string },
): Promise<TwilioSender> {
  if (reusableSid) {
    try {
      return await fetchWhatsappSender(credentials, reusableSid);
    } catch {}
  }
  return createWhatsappSender(credentials, input);
}
