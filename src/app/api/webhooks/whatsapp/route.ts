import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AgentEngine } from "@/lib/agent-engine";
import { sendWhatsappMessage } from "@/lib/whatsapp/meta-graph-api";
import { resolveWhatsappSession } from "@/lib/whatsapp/session";
import { verifyWhatsappSignature } from "@/lib/whatsapp/webhook-signature";
import { decideWhatsappSendGate } from "@/lib/whatsapp/enforcement";
import { evaluateReplyGate, recordAiReply, QUOTA_EXCEEDED_CUSTOMER_TEXT } from "@/lib/billing/enforcement";

// Trello D2/D4 -- Meta's single fixed callback URL for every company's
// WhatsApp numbers, the same shape as the Instagram webhook
// (src/app/api/webhooks/instagram/route.ts), which this route is modeled on
// closely. Public, unauthenticated (excluded from src/proxy.ts's
// session-refresh matcher, same reasoning as /c/, /talk/, api/chat/,
// webhooks/instagram) -- service-role client throughout, since there is no
// merchant session on this request at all.
//
// D2 (receive) and D4 (send the reply back) are built together here rather
// than as two separate call sites, same reasoning as Instagram's N4/N5:
// D4's only real caller is this route -- there's no template-message
// infrastructure in this pass, so nothing proactive would ever need to send
// a WhatsApp message from anywhere else.

// Verification: Meta sends this any time the Callback URL/Verify Token
// fields are (re)configured in the App Dashboard.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const token = url.searchParams.get("hub.verify_token");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse(null, { status: 403 });
}

interface WhatsappTextMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

// Trello D8 -- the merchant's own outgoing message, sent manually from the
// WhatsApp Business app after a coexistence connection. Arrives on the
// `smb_message_echoes` webhook field, keyed `message_echoes` in the payload.
interface WhatsappMessageEcho {
  id: string;
  from: string;
  to: string;
  type: string;
  text?: { body: string };
}

// Trello D8 -- one-time backfill of a coexistence merchant's pre-existing
// chat history, delivered on the `history` webhook field. `threads[].id` is
// the WhatsApp customer's own phone number -- simpler than comparing
// from/to against the business number to tell the two apart.
interface WhatsappHistoryThread {
  id: string;
  messages?: { id: string; from: string; type: string; text?: { body: string } }[];
}

interface WhatsappHistoryEntry {
  threads?: WhatsappHistoryThread[];
  // Present instead of `threads` when the merchant declined history
  // sharing from the WhatsApp Business app -- a clean no-op, not an error.
  errors?: { code?: number }[];
}

interface WhatsappChangeValue {
  metadata?: { phone_number_id?: string };
  messages?: WhatsappTextMessage[];
  message_echoes?: WhatsappMessageEcho[];
  history?: WhatsappHistoryEntry[];
}

interface WhatsappWebhookPayload {
  object?: string;
  entry?: { id: string; changes?: { value?: WhatsappChangeValue }[] }[];
}

// Extracts every genuine inbound text message across the whole batch,
// ordered by Meta's own `timestamp` -- not array position, since a single
// POST can bundle multiple entries and Meta doesn't guarantee delivery
// order across retries. Non-text payloads (images, stickers, location,
// etc.) are dropped here: MVP acks the batch (200) and doesn't attempt to
// interpret them as product queries, per the original D2 brief.
function extractInboundTextMessages(payload: WhatsappWebhookPayload) {
  const items: { phoneNumberId: string; from: string; text: string; messageId: string; timestamp: number }[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      for (const message of value?.messages ?? []) {
        if (message.type !== "text" || !message.text?.body) continue;
        items.push({
          phoneNumberId,
          from: message.from,
          text: message.text.body,
          messageId: message.id,
          timestamp: Number(message.timestamp) || 0,
        });
      }
    }
  }

  return items.sort((a, b) => a.timestamp - b.timestamp);
}

// Trello D8 -- every message_echoes entry across the batch. Unlike the
// customer-facing extractor above, echoes have no need for cross-entry
// timestamp ordering (each is independent, no reply is ever generated from
// one), so this is a flat map rather than a sort.
function extractMessageEchoes(payload: WhatsappWebhookPayload) {
  const items: { phoneNumberId: string; from: string; to: string; text: string; messageId: string }[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      for (const echo of value.message_echoes ?? []) {
        if (echo.type !== "text" || !echo.text?.body) continue;
        items.push({ phoneNumberId, from: echo.from, to: echo.to, text: echo.text.body, messageId: echo.id });
      }
    }
  }

  return items;
}

// Trello D8 -- every text message across every history-backfill thread in
// the batch. `customerPhone` is the thread's own id (the WhatsApp user's
// number), which is what lets the caller derive each message's role
// (`message.from === customerPhone` -> customer, else -> merchant) without
// needing the connection's own display_phone_number for comparison.
function extractHistoryMessages(payload: WhatsappWebhookPayload) {
  const items: { phoneNumberId: string; customerPhone: string; from: string; text: string; messageId: string }[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      for (const historyEntry of value.history ?? []) {
        for (const thread of historyEntry.threads ?? []) {
          for (const message of thread.messages ?? []) {
            if (message.type !== "text" || !message.text?.body) continue;
            items.push({ phoneNumberId, customerPhone: thread.id, from: message.from, text: message.text.body, messageId: message.id });
          }
        }
      }
    }
  }

  return items;
}

export async function POST(request: Request) {
  // Raw bytes, not request.json() -- the signature is computed over the
  // exact bytes Meta sent, and must be verified before the payload is
  // trusted enough to even parse.
  const rawBody = await request.text();
  if (!verifyWhatsappSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse(null, { status: 403 });
  }

  const payload = JSON.parse(rawBody) as WhatsappWebhookPayload;
  const supabase = createServiceClient();

  for (const { phoneNumberId, from, text, messageId } of extractInboundTextMessages(payload)) {
    // The connection this message belongs to -- phoneNumberId is our own
    // WABA number's id, which the per-agent unique index (migration
    // 20260905090000) guarantees maps to exactly one (company, agent). No
    // connection found means a number we're subscribed to no longer has a
    // live row -- skip rather than fail the whole batch.
    const { data: connection } = await supabase
      .from("company_whatsapp_connections")
      .select("company_id, agent_id, phone_number_id, access_token, status, has_payment_issue")
      .eq("phone_number_id", phoneNumberId)
      .eq("status", "connected")
      .maybeSingle();
    if (!connection) continue;

    // K6: a paused hire is silent on every channel. The connection can stay
    // "connected" while the merchant has toggled the agent off -- match
    // Instagram/web chat's gate and skip before persisting anything or
    // calling the engine.
    const { data: companyAgent } = await supabase
      .from("company_agents")
      .select("status")
      .eq("company_id", connection.company_id)
      .eq("agent_id", connection.agent_id)
      .maybeSingle();
    if (!companyAgent || companyAgent.status !== "active") continue;

    let session;
    try {
      session = await resolveWhatsappSession(supabase, connection.company_id, connection.agent_id, from);
    } catch (err) {
      console.error("WhatsApp webhook: failed to resolve session", err);
      continue;
    }

    // Idempotency: external_message_id is unique (partial index, migration
    // 20260831150000, shared with Instagram). A 23505 here means this exact
    // message was already handled -- by an earlier delivery of this same
    // webhook, or a concurrent one -- so stop for this item without calling
    // the Agent Engine or sending a second reply.
    const { error: customerMessageError } = await supabase
      .from("messages")
      .insert({
        company_id: connection.company_id,
        conversation_id: session.conversationId,
        role: "customer",
        content: text,
        external_message_id: messageId,
      });
    if (customerMessageError) {
      if (customerMessageError.code === "23505") continue;
      console.error("WhatsApp webhook: failed to persist inbound message", customerMessageError);
      continue;
    }

    // N9: a 'paused' conversation means a human has taken this thread over
    // -- the agent stays silent until someone resumes it. The inbound
    // message is already persisted above so a human sees it.
    const { data: conversation, error: conversationStatusError } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", session.conversationId)
      .single();
    if (conversationStatusError) {
      console.error("WhatsApp webhook: failed to read conversation status", conversationStatusError);
      continue;
    }
    if (conversation.status === "paused") continue;

    // D5: a known-bad WABA (disconnected since this row was read, or
    // flagged with a payment issue) can't deliver anything at all. Still
    // run the engine and persist the reply below for dashboard visibility
    // -- there is nothing to send either way -- but skip the delivery
    // attempt entirely rather than let D4 fail predictably.
    const sendGate = decideWhatsappSendGate({
      status: connection.status as "pending" | "connected" | "disconnected",
      hasPaymentIssue: connection.has_payment_issue as boolean,
    });

    // P4 + P7: the billing gate, same decision every other channel makes.
    const billingGate = await evaluateReplyGate(connection.company_id, supabase);
    if (!billingGate.allow) {
      if (billingGate.reason === "grace_exceeded") {
        console.warn("[billing] whatsapp reply blocked: reply quota grace exceeded", {
          companyId: connection.company_id,
        });
        const { error: cannedError } = await supabase
          .from("messages")
          .insert({
            company_id: connection.company_id,
            conversation_id: session.conversationId,
            role: "agent",
            content: QUOTA_EXCEEDED_CUSTOMER_TEXT,
          });
        if (!cannedError && sendGate.allow) {
          await sendWhatsappMessage(connection.access_token, connection.phone_number_id, from, QUOTA_EXCEEDED_CUSTOMER_TEXT);
        }
      }
      continue;
    }

    let result;
    try {
      result = await AgentEngine.run({ companyId: connection.company_id, conversationId: session.conversationId, message: text });
    } catch (err) {
      // Unlike a synchronous chat API, there is no HTTP caller waiting on
      // this reply -- nothing to return an error to except Meta, which only
      // cares that the webhook itself was received. Log and move to the
      // next item; the customer's message is already safely persisted.
      console.error("WhatsApp webhook: Agent Engine failed", err);
      continue;
    }

    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", session.conversationId);

    const { error: replyError } = await supabase
      .from("messages")
      .insert({ company_id: connection.company_id, conversation_id: session.conversationId, role: "agent", content: result.responseText });
    if (replyError) {
      console.error("WhatsApp webhook: failed to persist reply", replyError);
      continue;
    }

    // P7 -- count this reply against the plan's monthly pool (one replying
    // AgentEngine.run() = +1, channel-agnostic), regardless of whether
    // delivery below actually happens.
    await recordAiReply(connection.company_id, supabase);

    if (!sendGate.allow) {
      console.warn("[whatsapp] reply persisted but not sent: send gate blocked", {
        companyId: connection.company_id,
        reason: sendGate.reason,
      });
      continue;
    }

    const sendResult = await sendWhatsappMessage(connection.access_token, connection.phone_number_id, from, result.responseText);
    if (!sendResult.ok) {
      console.error("WhatsApp webhook: failed to deliver reply", { companyId: connection.company_id, kind: sendResult.kind });
      try {
        if (sendResult.kind === "token_invalid") {
          // Best-effort -- an expired/revoked token is not transient, so
          // D6's card should stop claiming this connection is live. Never
          // let this secondary write's own failure affect the webhook's
          // response to Meta.
          await supabase
            .from("company_whatsapp_connections")
            .update({ status: "disconnected", access_token: null, token_expires_at: null })
            .eq("company_id", connection.company_id)
            .eq("agent_id", connection.agent_id);
        } else if (sendResult.kind === "payment_issue") {
          await supabase
            .from("company_whatsapp_connections")
            .update({ has_payment_issue: true, payment_issue_detected_at: new Date().toISOString() })
            .eq("company_id", connection.company_id)
            .eq("agent_id", connection.agent_id);
        }
      } catch {
        // Nothing further to do -- already logged above.
      }
    }
  }

  // Trello D8 -- the merchant replied manually from their own WhatsApp
  // Business app (coexistence). Persist it as a `merchant` message for the
  // dashboard's history, then pause the conversation exactly like C5's
  // request_human flow -- same reasoning: a human has taken this thread
  // over, so the agent stays silent until someone (or the merchant, from
  // their own app) picks it back up. No new state, no timer -- reuses
  // conversations.status = 'paused' as-is.
  for (const { phoneNumberId, to, text, messageId } of extractMessageEchoes(payload)) {
    const { data: connection } = await supabase
      .from("company_whatsapp_connections")
      .select("company_id, agent_id")
      .eq("phone_number_id", phoneNumberId)
      .eq("status", "connected")
      .maybeSingle();
    if (!connection) continue;

    let session;
    try {
      session = await resolveWhatsappSession(supabase, connection.company_id, connection.agent_id, to);
    } catch (err) {
      console.error("WhatsApp webhook: failed to resolve session for echo", err);
      continue;
    }

    const { error: echoError } = await supabase
      .from("messages")
      .insert({
        company_id: connection.company_id,
        conversation_id: session.conversationId,
        role: "merchant",
        content: text,
        external_message_id: messageId,
      });
    if (echoError) {
      if (echoError.code === "23505") continue; // Already handled by an earlier/concurrent delivery.
      console.error("WhatsApp webhook: failed to persist message echo", echoError);
      continue;
    }

    await supabase.from("conversations").update({ status: "paused" }).eq("id", session.conversationId);
  }

  // Trello D8 -- one-time chat history backfill for a coexistence
  // connection. Persist-only: never calls AgentEngine.run() (this is
  // historical replay, not a live turn) and never touches conversation
  // status (unlike echoes, catching up on old messages isn't "a human just
  // took over" -- it's just sync).
  for (const { phoneNumberId, customerPhone, from, text, messageId } of extractHistoryMessages(payload)) {
    const { data: connection } = await supabase
      .from("company_whatsapp_connections")
      .select("company_id, agent_id")
      .eq("phone_number_id", phoneNumberId)
      .eq("status", "connected")
      .maybeSingle();
    if (!connection) continue;

    let session;
    try {
      session = await resolveWhatsappSession(supabase, connection.company_id, connection.agent_id, customerPhone);
    } catch (err) {
      console.error("WhatsApp webhook: failed to resolve session for history backfill", err);
      continue;
    }

    const { error: historyError } = await supabase
      .from("messages")
      .insert({
        company_id: connection.company_id,
        conversation_id: session.conversationId,
        role: from === customerPhone ? "customer" : "merchant",
        content: text,
        external_message_id: messageId,
      });
    if (historyError && historyError.code !== "23505") {
      console.error("WhatsApp webhook: failed to persist history message", historyError);
    }
  }

  // Always 200: Meta unsubscribes an endpoint that keeps failing for an
  // hour, and per-item failures above are already logged and skipped
  // rather than thrown, so there is nothing left that should turn into a
  // non-200 response.
  return new NextResponse(null, { status: 200 });
}
