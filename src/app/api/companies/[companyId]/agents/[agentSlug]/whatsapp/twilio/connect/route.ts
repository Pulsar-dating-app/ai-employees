import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decideWhatsappPlanGate } from "@/lib/whatsapp/enforcement";
import { findPlan } from "@/lib/billing/plans";
import { createSender, deleteSender, isSenderOnline, type TwilioSender } from "@/lib/whatsapp/twilio/api";
import { ensureCompanyTwilioAccount, recordCompanyWaba } from "@/lib/whatsapp/twilio/accounts";
import { normalizeE164 } from "@/lib/whatsapp/twilio/phone";
import { twilioInboundWebhookUrl, twilioStatusCallbackUrl } from "@/lib/whatsapp/twilio/urls";

// 2026-09-23 -- connects a merchant's WhatsApp number through Twilio (the
// replacement for ../connect, the Meta Cloud API flow). The dashboard first
// runs Meta's Embedded Signup popup (which creates the merchant's WABA and
// OTP-verifies the number) and hands the resulting `waba_id` here together
// with the number the merchant typed. This route then does the
// server-to-server part entirely on Twilio's side -- no Meta API call:
//   1. get-or-create the company's Twilio subaccount (one WABA per subaccount)
//   2. register the number as a WhatsApp sender in that subaccount (Senders
//      API v2) -- asynchronous: it comes back CREATING and turns ONLINE once
//      Meta approves the display name
//   3. persist the connection (pending, or connected if already ONLINE)
//
// Same conflict rules as the Meta connect route: one number answers exactly
// one agent platform-wide; a number held by another agent of THIS company can
// be moved with force=true, a number held by ANOTHER company is always a 409.
const SAFE_COLUMNS =
  "provider, phone_e164, waba_id, display_phone_number, status, connected_at, sender_status, quality_rating, messaging_limit, last_synced_at";

// Meta's display-name guidelines cap the name well below this; the real
// review happens on Meta's side, this just keeps garbage out of the request.
const MAX_DISPLAY_NAME_LENGTH = 100;

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

// POST: admin-only. Body: { wabaId, phoneNumber, displayName, force? }.
// Upserts on (company_id, agent_id), so reconnecting is idempotent.
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
  const wabaId = typeof body?.wabaId === "string" ? body.wabaId.trim() : "";
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  const phoneE164 = typeof body?.phoneNumber === "string" ? normalizeE164(body.phoneNumber) : null;
  const force = body?.force === true;

  if (!wabaId || !displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return NextResponse.json({ error: "wabaId, phoneNumber and displayName are required" }, { status: 400 });
  }
  if (!phoneE164) {
    return NextResponse.json({ error: "invalid_phone_number" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  // WhatsApp is a paid add-on (a `_wpp` plan variant). Checked before any
  // Twilio call -- rejecting an unentitled connect costs nothing.
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

  // Who holds this number right now? Turns the unique-index violation into an
  // answer the UI can act on instead of a raw 23505 surfacing as a 500.
  const { data: holder, error: holderError } = await serviceClient
    .from("company_whatsapp_connections")
    .select("id, company_id, agent_id, twilio_sender_sid, status, sender_status, quality_rating, messaging_limit, connected_at")
    .eq("provider", "twilio")
    .eq("phone_e164", phoneE164)
    .neq("status", "disconnected")
    .maybeSingle();
  if (holderError) return NextResponse.json({ error: holderError.message }, { status: 500 });

  if (holder && holder.company_id !== companyId) {
    return NextResponse.json({ error: "whatsapp_number_connected_elsewhere" }, { status: 409 });
  }

  // The sender to reuse when the number is already registered in this
  // company's subaccount -- either this agent reconnecting the same number,
  // or (with force) moving it over from another agent. No second Twilio
  // registration in either case: it's the same sender.
  let reuseSenderSid: string | null = null;
  if (holder) {
    if (holder.agent_id !== agent.id) {
      if (!force) {
        const { data: holdingAgent } = await supabase.from("agents").select("slug").eq("id", holder.agent_id).maybeSingle();
        return NextResponse.json(
          { error: "whatsapp_number_connected_to_other_agent", agentSlug: holdingAgent?.slug ?? null },
          { status: 409 },
        );
      }
      // twilio_sender_sid is unique, so the old row must give it up before
      // this agent's row can take it.
      const { error: releaseError } = await serviceClient
        .from("company_whatsapp_connections")
        .update({ status: "disconnected", twilio_sender_sid: null, sender_status: null })
        .eq("id", holder.id);
      if (releaseError) return NextResponse.json({ error: releaseError.message }, { status: 500 });
    }
    reuseSenderSid = holder.twilio_sender_sid as string | null;
  }

  // Twilio binds one WABA to a subaccount, so a company whose subaccount is
  // already on WABA X can't register a number from WABA Y.
  const { data: company } = await serviceClient.from("companies").select("name").eq("id", companyId).maybeSingle();
  let account;
  try {
    account = await ensureCompanyTwilioAccount(
      serviceClient,
      companyId,
      `${(company?.name as string | undefined) ?? "Company"} (${companyId})`,
    );
  } catch (err) {
    console.error("Twilio connect: failed to get/create subaccount", err);
    return NextResponse.json({ error: "Failed to connect WhatsApp" }, { status: 502 });
  }
  if (account.wabaId && account.wabaId !== wabaId) {
    return NextResponse.json({ error: "whatsapp_waba_mismatch" }, { status: 409 });
  }

  // This agent's own previous number, if it's being swapped for a different
  // one: give the old sender back so it stops receiving and doesn't keep the
  // WABA bound. Best-effort -- the new registration must not fail on it.
  const { data: previous } = await serviceClient
    .from("company_whatsapp_connections")
    .select("twilio_sender_sid, phone_e164, status")
    .eq("company_id", companyId)
    .eq("agent_id", agent.id)
    .maybeSingle();
  if (previous?.twilio_sender_sid && previous.status !== "disconnected" && previous.phone_e164 !== phoneE164) {
    try {
      await deleteSender(account, previous.twilio_sender_sid as string);
    } catch (err) {
      console.error("Twilio connect: failed to delete this agent's previous sender", err);
    }
  }

  let senderSid = reuseSenderSid;
  let sender: TwilioSender | null = null;
  if (!senderSid) {
    try {
      sender = await createSender(account, {
        phoneE164,
        wabaId,
        displayName,
        webhookUrl: twilioInboundWebhookUrl(companyId),
        statusCallbackUrl: twilioStatusCallbackUrl(companyId),
      });
      senderSid = sender.sid;
    } catch (err) {
      // Never leak Twilio's raw error text to the merchant-facing UI.
      console.error("Twilio connect: sender registration failed", err);
      return NextResponse.json({ error: "Failed to connect WhatsApp" }, { status: 502 });
    }
  }

  if (!account.wabaId) {
    try {
      await recordCompanyWaba(serviceClient, companyId, wabaId);
    } catch (err) {
      console.error("Twilio connect: failed to record the company's WABA", err);
    }
  }

  // A reused sender keeps the state it already had (ONLINE stays ONLINE; the
  // status route/cron corrects it otherwise); a fresh one starts from what
  // Twilio just answered.
  const online = sender ? isSenderOnline(sender) : holder?.status === "connected";
  const state = sender
    ? {
        sender_status: sender.status,
        quality_rating: sender.qualityRating,
        messaging_limit: sender.messagingLimit,
        connected_at: online ? new Date().toISOString() : null,
      }
    : {
        sender_status: (holder?.sender_status as string | null) ?? null,
        quality_rating: (holder?.quality_rating as string | null) ?? null,
        messaging_limit: (holder?.messaging_limit as string | null) ?? null,
        connected_at: (holder?.connected_at as string | null) ?? null,
      };
  const { data: connection, error } = await serviceClient
    .from("company_whatsapp_connections")
    .upsert(
      {
        company_id: companyId,
        agent_id: agent.id,
        provider: "twilio",
        phone_number_id: null,
        phone_e164: phoneE164,
        waba_id: wabaId,
        display_phone_number: phoneE164,
        twilio_sender_sid: senderSid,
        status: online ? "connected" : "pending",
        ...state,
        last_synced_at: new Date().toISOString(),
        access_token: null,
        token_expires_at: null,
        two_step_pin: null,
        has_payment_issue: false,
        payment_issue_detected_at: null,
        is_coexistence: false,
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
