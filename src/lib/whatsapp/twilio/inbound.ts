import type { SupabaseClient } from "@supabase/supabase-js";
import { AgentEngine } from "@/lib/agent-engine";
import { findPlan } from "@/lib/billing/plans";
import { evaluateReplyGate, recordAiReply } from "@/lib/billing/enforcement";
import { toStoredGrounding } from "@/lib/chat/grounding";
import { decideWhatsappPlanGate, decideWhatsappSendGate } from "@/lib/whatsapp/enforcement";
import { resolveWhatsappSession } from "@/lib/whatsapp/session";
import { sendWhatsappMessage, type TwilioCredentials } from "./api";
import { twilioStatusCallbackUrl } from "./urls";

// The reply pipeline behind the Twilio inbound webhook -- the same sequence
// the Meta webhook (src/app/api/webhooks/whatsapp/route.ts) runs, moved out of
// the route because Twilio's webhook has a hard ~15s read timeout: the route
// acknowledges immediately and runs this in Next's `after()`, so a slow Agent
// Engine turn never turns into a Twilio-side timeout + retry.
//
// Every failure is logged and swallowed -- there is no caller left to return
// an error to (the HTTP response already went out), and the customer's message
// is persisted early, so a human still sees it.
export interface TwilioConnectionRow {
  id: string;
  company_id: string;
  agent_id: string;
  phone_e164: string;
  status: "pending" | "connected" | "disconnected";
  sender_status: string | null;
}

export interface InboundWhatsappMessage {
  // Digits-only customer phone (customers.phone).
  customerPhone: string;
  text: string;
  // Twilio MessageSid -- the idempotency key (messages.external_message_id).
  messageSid: string;
}

export async function processInboundTwilioMessage(
  supabase: SupabaseClient,
  credentials: TwilioCredentials,
  connection: TwilioConnectionRow,
  inbound: InboundWhatsappMessage,
): Promise<void> {
  const { company_id: companyId, agent_id: agentId } = connection;

  // K6: a paused hire is silent on every channel.
  const { data: companyAgent } = await supabase
    .from("company_agents")
    .select("status")
    .eq("company_id", companyId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!companyAgent || companyAgent.status !== "active") return;

  // WhatsApp is a paid add-on: a number can stay connected after the plan
  // stopped including it. Full skip -- nothing persisted, the channel shows
  // as not working at all (contrast with the billing/paused gates below,
  // which persist the inbound message for dashboard visibility first).
  const { data: billing } = await supabase
    .from("company_billing")
    .select("plan_key, subscription_status")
    .eq("company_id", companyId)
    .maybeSingle();
  const planGate = decideWhatsappPlanGate({
    subscription_status: (billing?.subscription_status as string | null) ?? null,
    whatsappIncluded: findPlan(billing?.plan_key as string | null)?.whatsappIncluded === true,
  });
  if (!planGate.allow) return;

  let session;
  try {
    session = await resolveWhatsappSession(supabase, companyId, agentId, inbound.customerPhone);
  } catch (err) {
    console.error("Twilio WhatsApp: failed to resolve session", err);
    return;
  }

  // Idempotency: external_message_id is unique. A 23505 means this exact
  // message was already handled (a Twilio retry, or a concurrent delivery),
  // so stop without calling the Agent Engine or sending a second reply.
  const { error: customerMessageError } = await supabase.from("messages").insert({
    company_id: companyId,
    conversation_id: session.conversationId,
    role: "customer",
    content: inbound.text,
    external_message_id: inbound.messageSid,
  });
  if (customerMessageError) {
    if (customerMessageError.code === "23505") return;
    console.error("Twilio WhatsApp: failed to persist inbound message", customerMessageError);
    return;
  }

  // N9: a 'paused' conversation means a human has taken this thread over.
  const { data: conversation, error: conversationStatusError } = await supabase
    .from("conversations")
    .select("status")
    .eq("id", session.conversationId)
    .single();
  if (conversationStatusError) {
    console.error("Twilio WhatsApp: failed to read conversation status", conversationStatusError);
    return;
  }
  if (conversation.status === "paused") return;

  const sendGate = decideWhatsappSendGate({
    status: connection.status,
    hasPaymentIssue: false,
    senderOffline: !!connection.sender_status && connection.sender_status.toUpperCase() !== "ONLINE",
  });

  // P4 + P7: the billing gate, same decision every other channel makes.
  const billingGate = await evaluateReplyGate(companyId, supabase);
  if (!billingGate.allow) {
    console.warn(`[billing] whatsapp reply blocked (${billingGate.reason})`, { companyId });
    return;
  }

  let result;
  try {
    result = await AgentEngine.run({ companyId, conversationId: session.conversationId, message: inbound.text });
  } catch (err) {
    console.error("Twilio WhatsApp: Agent Engine failed", err);
    return;
  }

  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", session.conversationId);

  // WhatsApp has no product cards, so `metadata` only ever carries usage +
  // grounding on this channel.
  const { error: replyError } = await supabase.from("messages").insert({
    company_id: companyId,
    conversation_id: session.conversationId,
    role: "agent",
    content: result.responseText,
    metadata: { usage: result.usage, grounding: toStoredGrounding(result.grounding) },
  });
  if (replyError) {
    console.error("Twilio WhatsApp: failed to persist reply", replyError);
    return;
  }

  // P7 -- count this reply against the plan's monthly pool regardless of
  // whether delivery below actually happens.
  await recordAiReply(companyId, supabase);

  if (!sendGate.allow) {
    console.warn("[whatsapp] reply persisted but not sent: send gate blocked", { companyId, reason: sendGate.reason });
    return;
  }

  const sendResult = await sendWhatsappMessage(credentials, {
    fromE164: connection.phone_e164,
    toPhone: inbound.customerPhone,
    text: result.responseText,
    statusCallbackUrl: twilioStatusCallbackUrl(companyId),
  });
  if (sendResult.ok) return;

  console.error("Twilio WhatsApp: failed to deliver reply", {
    companyId,
    kind: sendResult.kind,
    errorDetail: sendResult.kind === "other" ? sendResult.errorDetail : undefined,
  });
  try {
    if (sendResult.kind === "sender_offline") {
      // The sender is gone or not live -- record it so the dashboard shows
      // the truth and the send gate stops trying until the sync cron sees it
      // ONLINE again.
      await supabase
        .from("company_whatsapp_connections")
        .update({ sender_status: "OFFLINE", last_synced_at: new Date().toISOString() })
        .eq("id", connection.id);
    }
    // account_problem needs Staffra, not the merchant: a suspended or
    // out-of-credit Twilio account fails every company at once. Logged at
    // error level above; alerting hooks onto that log line.
  } catch {
    // Nothing further to do -- already logged.
  }
}
