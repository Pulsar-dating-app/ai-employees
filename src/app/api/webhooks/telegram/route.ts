import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AgentEngine } from "@/lib/agent-engine";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";
import { resolveTelegramSession } from "@/lib/telegram/session";
import { evaluateReplyGate, recordAiReply } from "@/lib/billing/enforcement";

// Trello O1 -- one shared bot for every company's Telegram customers,
// unlike WhatsApp/Instagram's per-merchant assets. There is no connect
// flow: a hired agent's deep link (t.me/<bot>?start=<company_agents.id>)
// IS the connection -- opening it sends /start <payload> here, which
// creates the customer/conversation pairing on the spot. Public,
// unauthenticated (excluded from src/proxy.ts's session-refresh matcher,
// same reasoning as /c/, /talk/, api/chat/, webhooks/instagram,
// webhooks/whatsapp) -- service-role client throughout, since there is no
// merchant session on this request at all.
//
// Security: Telegram's mechanism is a static secret header, not a body
// signature -- set once via the setWebhook API call's `secret_token` param
// (a one-time manual/deploy step, not something this route or any other
// code calls at runtime).
function verifyTelegramSecret(request: Request): boolean {
  return request.headers.get("x-telegram-bot-api-secret-token") === process.env.TELEGRAM_WEBHOOK_SECRET;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
}

interface TelegramUpdate {
  message?: TelegramMessage;
}

export async function POST(request: Request) {
  if (!verifyTelegramSecret(request)) {
    return new NextResponse(null, { status: 403 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const message = update?.message;
  const text = message?.text;
  if (!message || !text) {
    // Non-text updates (stickers, edits, other update types) -- MVP acks
    // and ignores them, same convention as D2/N4's non-text handling.
    return new NextResponse(null, { status: 200 });
  }

  const chatId = String(message.chat.id);
  const supabase = createServiceClient();

  if (text.startsWith("/start")) {
    // The deep-link payload is company_agents.id -- resolving it gives
    // company_id/agent_id directly, no separate lookup table. A missing or
    // malformed payload, or an id that doesn't resolve (stale/tampered
    // link, or the hire was removed), is silently ignored -- there is
    // nothing to connect to.
    const payload = text.slice("/start".length).trim();
    if (!payload) return new NextResponse(null, { status: 200 });

    const { data: companyAgent } = await supabase
      .from("company_agents")
      .select("company_id, agent_id, name, status")
      .eq("id", payload)
      .maybeSingle();
    // K6 parity: a paused hire stays silent, same as every other channel.
    if (!companyAgent || companyAgent.status !== "active") {
      return new NextResponse(null, { status: 200 });
    }

    const { data: agent } = await supabase.from("agents").select("role").eq("id", companyAgent.agent_id).maybeSingle();

    try {
      // The /start turn only needs the customer/conversation to exist --
      // no reply is generated from it beyond the welcome sent below.
      await resolveTelegramSession(supabase, companyAgent.company_id, companyAgent.agent_id, chatId);
    } catch (err) {
      console.error("Telegram webhook: failed to resolve session on /start", err);
      return new NextResponse(null, { status: 200 });
    }

    const name = companyAgent.name ?? agent?.role ?? "";
    const welcomeText = name
      ? `Oi! Eu sou ${name} 😊 Como posso te ajudar?`
      : "Oi! 😊 Como posso te ajudar?";
    await sendTelegramMessage(chatId, welcomeText);
    return new NextResponse(null, { status: 200 });
  }

  // A plain message from a chat_id we don't recognize means the customer
  // never opened a deep link (or opened one for a hire that no longer
  // resolves) -- there is no company/agent to route this to, so it's
  // silently dropped rather than guessed at.
  const { data: customer } = await supabase
    .from("customers")
    .select("id, company_id")
    .eq("channel", "telegram")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  if (!customer) return new NextResponse(null, { status: 200 });

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, agent_id, status")
    .eq("customer_id", customer.id)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conversation) return new NextResponse(null, { status: 200 });

  // K6: a paused hire is silent on every channel.
  const { data: companyAgent } = await supabase
    .from("company_agents")
    .select("status")
    .eq("company_id", customer.company_id)
    .eq("agent_id", conversation.agent_id)
    .maybeSingle();
  if (!companyAgent || companyAgent.status !== "active") return new NextResponse(null, { status: 200 });

  // Idempotency: external_message_id is unique (partial index, shared with
  // WhatsApp/Instagram). Telegram's message_id is scoped per chat, not
  // globally, but the mid/message-id values of the other two channels
  // aren't scoped to our own namespace either -- collisions across
  // channels are exactly as unlikely as they already are today.
  const { error: customerMessageError } = await supabase
    .from("messages")
    .insert({
      company_id: customer.company_id,
      conversation_id: conversation.id,
      role: "customer",
      content: text,
      external_message_id: `tg-${chatId}-${message.message_id}`,
    });
  if (customerMessageError) {
    if (customerMessageError.code === "23505") return new NextResponse(null, { status: 200 });
    console.error("Telegram webhook: failed to persist inbound message", customerMessageError);
    return new NextResponse(null, { status: 200 });
  }

  // N9: a 'paused' conversation means a human has taken this thread over.
  if (conversation.status === "paused") return new NextResponse(null, { status: 200 });

  // P4 + P7: the billing gate, same decision every other channel makes. A
  // lapsed subscription or a reply-quota grace band overrun both silence the
  // AI -- no canned reply (a hard-coded PT-only line was tried and dropped;
  // see decisions.md). The inbound message is already persisted above.
  const billingGate = await evaluateReplyGate(customer.company_id, supabase);
  if (!billingGate.allow) {
    console.warn(`[billing] telegram reply blocked (${billingGate.reason})`, { companyId: customer.company_id });
    return new NextResponse(null, { status: 200 });
  }

  let result;
  try {
    result = await AgentEngine.run({ companyId: customer.company_id, conversationId: conversation.id, message: text });
  } catch (err) {
    console.error("Telegram webhook: Agent Engine failed", err);
    return new NextResponse(null, { status: 200 });
  }

  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id);

  const { error: replyError } = await supabase
    .from("messages")
    .insert({ company_id: customer.company_id, conversation_id: conversation.id, role: "agent", content: result.responseText });
  if (replyError) {
    console.error("Telegram webhook: failed to persist reply", replyError);
    return new NextResponse(null, { status: 200 });
  }

  await recordAiReply(customer.company_id, supabase);

  const sendResult = await sendTelegramMessage(chatId, result.responseText);
  if (!sendResult.ok) {
    console.error("Telegram webhook: failed to deliver reply", { companyId: customer.company_id, errorDetail: sendResult.errorDetail });
  }

  // Always 200: Telegram retries an endpoint that keeps failing, and
  // per-item failures above are already logged and skipped rather than
  // thrown, so there is nothing left that should turn into a non-200
  // response.
  return new NextResponse(null, { status: 200 });
}
