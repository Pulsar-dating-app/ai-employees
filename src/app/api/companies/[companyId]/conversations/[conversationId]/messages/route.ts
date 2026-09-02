import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendInstagramMessage } from "@/lib/instagram/meta-instagram-api";

// Trello F5 / N10 -- a merchant's manual reply. Sending one *is* taking
// over: this always flips the conversation to 'paused' (unless already
// there), no separate "take over" step. The AI stays off (N9's gate, in
// src/app/api/chat/... and the Instagram webhook, checks this same status)
// until "Resume AI" (the sibling route's PATCH) hands control back.
//
// N10: the reply is now also *delivered* on the conversation's own channel,
// not just persisted. Web chat needs nothing (the customer's widget polls
// and picks it up). Instagram needs an actual outbound send via
// sendInstagramMessage. The message row is persisted first and always --
// delivery is reported back as { delivery: { ok } } so the UI can warn
// without ever losing the merchant's text.
//
// N11: past Instagram's 24h messaging window, delivery only works under the
// HUMAN_AGENT tag (7 days, human replies only). deliverOverInstagram looks
// at the age of the last inbound customer message and passes the tag when
// that age is >24h and <=7d -- inside 24h it sends normally, and past 7d
// nothing can be done so it sends normally and lets the send fail (same as
// before N11). The agent's own automated replies (the webhook) never use it.

const MAX_MESSAGE_LENGTH = 4000;

// Instagram's standard messaging window; the HUMAN_AGENT tag extends it to 7 days.
const STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000;
const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!membership) {
    return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }) };
  }
  return { error: null };
}

// Delivers a just-persisted merchant reply over Instagram. Returns whether
// it reached the customer; never throws -- the caller has already saved the
// message and only needs to know if it went out.
async function deliverOverInstagram(
  companyId: string,
  conversationId: string,
  agentId: string | null,
  customerId: string,
  text: string,
): Promise<{ ok: boolean }> {
  if (!agentId) return { ok: false };
  const service = createServiceClient();

  const [{ data: connection }, { data: customer }, { data: lastInbound }] = await Promise.all([
    service
      .from("company_instagram_connections")
      .select("access_token, instagram_user_id, status")
      .eq("company_id", companyId)
      .eq("agent_id", agentId)
      .maybeSingle(),
    service.from("customers").select("instagram_user_id").eq("id", customerId).maybeSingle(),
    service
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("role", "customer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!connection || connection.status !== "connected" || !customer?.instagram_user_id) {
    return { ok: false };
  }

  // N11: reply under the HUMAN_AGENT tag only when the customer's last
  // message is past the standard 24h window but still inside the 7-day one
  // the tag allows. No inbound on record -> treat as inside the window
  // (don't tag): a takeover always follows an inbound, so this is only the
  // defensive path.
  const lastInboundAgeMs = lastInbound?.created_at
    ? Date.now() - new Date(lastInbound.created_at).getTime()
    : 0;
  const humanAgentTag = lastInboundAgeMs > STANDARD_WINDOW_MS && lastInboundAgeMs <= HUMAN_AGENT_WINDOW_MS;

  const result = await sendInstagramMessage(
    connection.access_token,
    connection.instagram_user_id,
    customer.instagram_user_id,
    text,
    { humanAgentTag },
  );

  if (!result.ok && result.tokenInvalid) {
    // Same best-effort dead-token handling as the inbound webhook -- flip
    // the connection so N3's card stops claiming it's live. Its own failure
    // never changes what this route returns.
    try {
      await service
        .from("company_instagram_connections")
        .update({ status: "disconnected", access_token: null, token_expires_at: null })
        .eq("company_id", companyId)
        .eq("agent_id", agentId);
    } catch {
      // Nothing further to do.
    }
  }

  return { ok: result.ok };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; conversationId: string }> },
) {
  const { companyId, conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }, { status: 400 });
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, status, channel, agent_id, customer_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (conversationError) {
    return NextResponse.json({ error: conversationError.message }, { status: 500 });
  }
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: reply, error: replyError } = await supabase
    .from("messages")
    .insert({ company_id: companyId, conversation_id: conversationId, role: "merchant", content: message })
    .select("role, content, created_at")
    .single();
  if (replyError) {
    return NextResponse.json({ error: replyError.message }, { status: 500 });
  }

  if (conversation.status !== "paused") {
    const { error: pauseError } = await supabase
      .from("conversations")
      .update({ status: "paused" })
      .eq("id", conversationId);
    if (pauseError) {
      return NextResponse.json({ error: pauseError.message }, { status: 500 });
    }
  } else {
    // Already paused -- still bump updated_at so this conversation sorts to
    // the top of the list, same as every other message-sent path.
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }

  // Deliver on the channel. Web chat: nothing to do, the widget polls.
  // Instagram: an actual outbound send.
  let delivery: { ok: boolean } | null = null;
  if (conversation.channel === "instagram") {
    delivery = await deliverOverInstagram(
      companyId,
      conversationId,
      conversation.agent_id,
      conversation.customer_id,
      message,
    );
  }

  return NextResponse.json({ message: reply, delivery }, { status: 201 });
}
