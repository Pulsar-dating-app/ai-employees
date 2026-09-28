import type { SupabaseClient } from "@supabase/supabase-js";
import { AgentEngine } from "@/lib/agent-engine";
import { resolveWhatsappSession } from "@/lib/whatsapp/session";
import { decideWhatsappSendGate, decideWhatsappPlanGate } from "@/lib/whatsapp/enforcement";
import type { SendWhatsappMessageResult } from "@/lib/whatsapp/meta-graph-api";
import { findPlan } from "@/lib/billing/plans";
import { evaluateReplyGate, recordAiReply } from "@/lib/billing/enforcement";
import { toStoredGrounding } from "@/lib/chat/grounding";

export type InboundWhatsappConnection = {
  company_id: string;
  agent_id: string;
  status: string;
  has_payment_issue: boolean;
};

export async function handleInboundWhatsappMessage(
  supabase: SupabaseClient,
  connection: InboundWhatsappConnection,
  message: { from: string; text: string; messageId: string },
  sendReply: (text: string) => Promise<SendWhatsappMessageResult>,
): Promise<void> {
  const { from, text, messageId } = message;

  const { data: companyAgent } = await supabase
    .from("company_agents")
    .select("status")
    .eq("company_id", connection.company_id)
    .eq("agent_id", connection.agent_id)
    .maybeSingle();
  if (!companyAgent || companyAgent.status !== "active") return;

  const { data: billing } = await supabase
    .from("company_billing")
    .select("plan_key, subscription_status")
    .eq("company_id", connection.company_id)
    .maybeSingle();
  const planGate = decideWhatsappPlanGate({
    subscription_status: (billing?.subscription_status as string | null) ?? null,
    whatsappIncluded: findPlan(billing?.plan_key as string | null)?.whatsappIncluded === true,
  });
  if (!planGate.allow) return;

  let session;
  try {
    session = await resolveWhatsappSession(supabase, connection.company_id, connection.agent_id, from);
  } catch (err) {
    console.error("WhatsApp webhook: failed to resolve session", err);
    return;
  }

  const { error: customerMessageError } = await supabase.from("messages").insert({
    company_id: connection.company_id,
    conversation_id: session.conversationId,
    role: "customer",
    content: text,
    external_message_id: messageId,
  });
  if (customerMessageError) {
    if (customerMessageError.code !== "23505") {
      console.error("WhatsApp webhook: failed to persist inbound message", customerMessageError);
    }
    return;
  }

  const { data: conversation, error: conversationStatusError } = await supabase
    .from("conversations")
    .select("status")
    .eq("id", session.conversationId)
    .single();
  if (conversationStatusError) {
    console.error("WhatsApp webhook: failed to read conversation status", conversationStatusError);
    return;
  }
  if (conversation.status === "paused") return;

  const sendGate = decideWhatsappSendGate({
    status: connection.status as "pending" | "connected" | "disconnected",
    hasPaymentIssue: connection.has_payment_issue,
  });

  const billingGate = await evaluateReplyGate(connection.company_id, supabase);
  if (!billingGate.allow) {
    console.warn(`[billing] whatsapp reply blocked (${billingGate.reason})`, { companyId: connection.company_id });
    return;
  }

  let result;
  try {
    result = await AgentEngine.run({ companyId: connection.company_id, conversationId: session.conversationId, message: text });
  } catch (err) {
    console.error("WhatsApp webhook: Agent Engine failed", err);
    return;
  }

  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", session.conversationId);

  const { error: replyError } = await supabase.from("messages").insert({
    company_id: connection.company_id,
    conversation_id: session.conversationId,
    role: "agent",
    content: result.responseText,
    metadata: { usage: result.usage, grounding: toStoredGrounding(result.grounding) },
  });
  if (replyError) {
    console.error("WhatsApp webhook: failed to persist reply", replyError);
    return;
  }

  await recordAiReply(connection.company_id, supabase);

  if (!sendGate.allow) {
    console.warn("[whatsapp] reply persisted but not sent: send gate blocked", {
      companyId: connection.company_id,
      reason: sendGate.reason,
    });
    return;
  }

  const sendResult = await sendReply(result.responseText);
  if (sendResult.ok) return;

  console.error("WhatsApp webhook: failed to deliver reply", {
    companyId: connection.company_id,
    kind: sendResult.kind,
    errorDetail: sendResult.kind === "other" ? sendResult.errorDetail : undefined,
  });
  await recordWhatsappSendFailure(supabase, connection.company_id, connection.agent_id, sendResult);
}

export async function recordWhatsappSendFailure(
  supabase: SupabaseClient,
  companyId: string,
  agentId: string,
  result: SendWhatsappMessageResult,
): Promise<void> {
  if (result.ok) return;
  try {
    if (result.kind === "token_invalid") {
      await supabase
        .from("company_whatsapp_connections")
        .update({ status: "disconnected", access_token: null, token_expires_at: null })
        .eq("company_id", companyId)
        .eq("agent_id", agentId);
    } else if (result.kind === "payment_issue") {
      await supabase
        .from("company_whatsapp_connections")
        .update({ has_payment_issue: true, payment_issue_detected_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("agent_id", agentId);
    }
  } catch {}
}
