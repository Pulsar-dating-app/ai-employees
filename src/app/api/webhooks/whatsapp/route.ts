import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendWhatsappMessage } from "@/lib/whatsapp/meta-graph-api";
import { resolveWhatsappSession } from "@/lib/whatsapp/session";
import { verifyWhatsappSignature } from "@/lib/whatsapp/webhook-signature";
import { handleInboundWhatsappMessage } from "@/lib/whatsapp/inbound";

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
    const { data: connection } = await supabase
      .from("company_whatsapp_connections")
      .select("company_id, agent_id, phone_number_id, access_token, status, has_payment_issue")
      .eq("phone_number_id", phoneNumberId)
      .eq("provider", "meta")
      .eq("status", "connected")
      .maybeSingle();
    if (!connection) continue;

    await handleInboundWhatsappMessage(supabase, connection, { from, text, messageId }, (reply) =>
      sendWhatsappMessage(connection.access_token, connection.phone_number_id, from, reply),
    );
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
      .eq("provider", "meta")
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
      .eq("provider", "meta")
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
