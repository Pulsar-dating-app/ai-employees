import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AgentEngine } from "@/lib/agent-engine";
import { sendInstagramMessage } from "@/lib/instagram/meta-instagram-api";
import { resolveInstagramSession } from "@/lib/instagram/session";
import { verifyInstagramSignature } from "@/lib/instagram/webhook-signature";
import { isBillingLapsed } from "@/lib/billing/activation";

// Trello N4/N5 -- Meta's single fixed callback URL for every company's
// Instagram DMs, the way instagram-callback/route.ts is one shared OAuth
// callback for every agent. Public, unauthenticated (excluded from
// src/proxy.ts's session-refresh matcher, same reasoning as /c/, /talk/,
// api/chat/) -- service-role client throughout, since there is no
// merchant session on this request at all.
//
// N4 (receive) and N5 (send the reply back) are built together here rather
// than as two separate call sites: N5's only real caller is this route --
// nothing proactive is possible on this channel (no message templates, see
// decisions.md), so there is no second place that would ever need to send
// an Instagram message. Splitting them into two files would just be an
// import with no independent reuse.

// Verification: Meta sends this any time the Callback URL/Verify Token
// fields are (re)configured in the App Dashboard.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const token = url.searchParams.get("hub.verify_token");

  if (mode === "subscribe" && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse(null, { status: 403 });
}

interface InstagramMessage {
  mid: string;
  text?: string;
  is_echo?: boolean;
  is_deleted?: boolean;
  is_unsupported?: boolean;
}

interface InstagramMessagingItem {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: InstagramMessage;
  // message_reactions/postbacks/referrals/reads/edits all arrive on this
  // same array under their own key instead of `message` -- not modeled
  // here since they're all ignored (see the loop below).
}

interface InstagramWebhookPayload {
  object?: string;
  entry?: { id: string; time: number; messaging?: InstagramMessagingItem[] }[];
}

// Extracts every genuine, actionable inbound text message across the whole
// batch and orders them by Instagram's own `timestamp` -- not by array
// position, since Meta doesn't guarantee delivery order across retries and
// a single POST can bundle multiple entries. Everything that isn't a plain
// text message from a customer (our own echoed sends, deletions,
// unsupported media, reactions/postbacks/etc.) is dropped here: MVP acks
// and ignores it rather than feeding it to the model as though it were a
// question.
function extractInboundTextMessages(payload: InstagramWebhookPayload) {
  const items: { recipientId: string; senderId: string; text: string; mid: string; timestamp: number }[] = [];

  for (const entry of payload.entry ?? []) {
    for (const item of entry.messaging ?? []) {
      const message = item.message;
      if (!message || message.is_echo || message.is_deleted || message.is_unsupported || !message.text) {
        continue;
      }
      items.push({
        recipientId: item.recipient.id,
        senderId: item.sender.id,
        text: message.text,
        mid: message.mid,
        timestamp: item.timestamp,
      });
    }
  }

  return items.sort((a, b) => a.timestamp - b.timestamp);
}

export async function POST(request: Request) {
  // Raw bytes, not request.json() -- the signature is computed over the
  // exact bytes Meta sent, and must be verified before the payload is
  // trusted enough to even parse.
  const rawBody = await request.text();
  if (!verifyInstagramSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse(null, { status: 403 });
  }

  const payload = JSON.parse(rawBody) as InstagramWebhookPayload;
  const supabase = createServiceClient();

  const _items = extractInboundTextMessages(payload);
  console.error(
    "[ig-route]",
    JSON.stringify({
      rawHead: rawBody.slice(0, 300),
      itemCount: _items.length,
      items: _items.map((i) => ({ recipientId: i.recipientId, senderId: i.senderId, textLen: i.text?.length ?? 0, mid: i.mid?.slice(0, 8) })),
    }),
  );

  for (const { recipientId, senderId, text, mid } of _items) {
    // The connection this message belongs to -- recipientId is our own
    // business account's id, which N1 guarantees maps to exactly one
    // (company, agent). No connection found means an account we're
    // subscribed to no longer has a live row (disconnected, or never
    // should have been reachable) -- skip rather than fail the whole batch.
    const { data: connection } = await supabase
      .from("company_instagram_connections")
      .select("company_id, agent_id, instagram_user_id, access_token")
      .eq("instagram_user_id", recipientId)
      .eq("status", "connected")
      .maybeSingle();
    console.error("[ig-route] connLookup", JSON.stringify({ recipientId, found: Boolean(connection), agentId: connection?.agent_id ?? null }));
    if (!connection) continue;

    // K6: a paused hire is silent on every channel. The connection can stay
    // "connected" while the merchant has toggled the agent off -- match M3's
    // chat gate and skip before persisting anything or calling the engine.
    const { data: companyAgent } = await supabase
      .from("company_agents")
      .select("status")
      .eq("company_id", connection.company_id)
      .eq("agent_id", connection.agent_id)
      .maybeSingle();
    console.error("[ig-route] k6gate", JSON.stringify({ agentStatus: companyAgent?.status ?? null }));
    if (!companyAgent || companyAgent.status !== "active") continue;

    // P4: a lapsed subscription (card declined / unpaid / canceled) silences
    // the AI on every channel -- same "skip before persisting or calling the
    // engine" shape as the K6 gate above. Recovers automatically when
    // invoice.paid flips company_billing back to 'active'. A company that
    // never subscribed is untouched here (that cut-over is P6).
    const _lapsed = await isBillingLapsed(connection.company_id, supabase);
    console.error("[ig-route] billingGate", JSON.stringify({ lapsed: _lapsed }));
    if (_lapsed) continue;

    let session;
    try {
      session = await resolveInstagramSession(supabase, connection.company_id, connection.agent_id, senderId);
    } catch (err) {
      console.error("Instagram webhook: failed to resolve session", err);
      continue;
    }

    // The idempotency gate: external_message_id is unique (partial index,
    // migration 20260831150000). A 23505 here means this exact message was
    // already handled -- by an earlier delivery of this same webhook, or a
    // concurrent one -- so stop for this item without calling the Agent
    // Engine or sending a second reply.
    const { error: customerMessageError } = await supabase
      .from("messages")
      .insert({
        company_id: connection.company_id,
        conversation_id: session.conversationId,
        role: "customer",
        content: text,
        external_message_id: mid,
      });
    if (customerMessageError) {
      if (customerMessageError.code === "23505") continue;
      console.error("Instagram webhook: failed to persist inbound message", customerMessageError);
      continue;
    }

    // N9: a 'paused' conversation means C5's request_human fired and a human
    // has taken this thread over -- the agent stays silent until someone
    // resumes it (the 24h rotation never auto-reactivates a paused row, see
    // decisions.md 2026-08-27). The inbound message is already persisted
    // above so a human sees it; we just skip the engine and the reply. Same
    // shape as the K6 hire-paused gate above, and mirrors M3's web chat route.
    const { data: conversation, error: conversationStatusError } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", session.conversationId)
      .single();
    if (conversationStatusError) {
      console.error("Instagram webhook: failed to read conversation status", conversationStatusError);
      continue;
    }
    if (conversation.status === "paused") continue;

    let result;
    try {
      result = await AgentEngine.run({ companyId: connection.company_id, conversationId: session.conversationId, message: text });
    } catch (err) {
      // Unlike M3's synchronous chat API, there is no HTTP caller waiting
      // on this reply -- nothing to return an error to except Meta, which
      // only cares that the webhook itself was received. Log and move to
      // the next item; the customer's message is already safely persisted
      // above.
      console.error("Instagram webhook: Agent Engine failed", err);
      continue;
    }

    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", session.conversationId);

    const { error: replyError } = await supabase
      .from("messages")
      .insert({ company_id: connection.company_id, conversation_id: session.conversationId, role: "agent", content: result.responseText });
    if (replyError) {
      console.error("Instagram webhook: failed to persist reply", replyError);
      continue;
    }

    const sendResult = await sendInstagramMessage(connection.access_token, connection.instagram_user_id, senderId, result.responseText);
    if (!sendResult.ok) {
      console.error("Instagram webhook: failed to deliver reply", { companyId: connection.company_id, tokenInvalid: sendResult.tokenInvalid });
      if (sendResult.tokenInvalid) {
        // Best-effort -- an expired/revoked token is not transient, so N3's
        // card should stop claiming this connection is live. Never let this
        // secondary write's own failure affect the webhook's response to Meta.
        try {
          await supabase
            .from("company_instagram_connections")
            .update({ status: "disconnected", access_token: null, token_expires_at: null })
            .eq("company_id", connection.company_id)
            .eq("agent_id", connection.agent_id);
        } catch {
          // Nothing further to do -- already logged above.
        }
      }
    }
  }

  // Always 200: Meta unsubscribes an endpoint that keeps failing for an
  // hour, and per-item failures above are already logged and skipped
  // rather than thrown, so there is nothing left that should turn into a
  // non-200 response.
  return new NextResponse(null, { status: 200 });
}
