import type { SupabaseClient } from "@supabase/supabase-js";

// Trello O1 -- find-or-create the customer for an inbound Telegram chat,
// find-or-rotate their active conversation. A sibling of
// src/lib/whatsapp/session.ts and src/lib/instagram/session.ts, not a
// shared helper -- same reasoning those files' own comments give: each
// channel's session logic is tied to its own identity column
// (telegram_chat_id here) and channel value, not to a common abstraction
// worth maintaining for three-and-growing callers.
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

export type TelegramSession = { customerId: string; conversationId: string };

export async function resolveTelegramSession(
  supabase: SupabaseClient,
  companyId: string,
  agentId: string,
  chatId: string,
): Promise<TelegramSession> {
  const { data: existingCustomer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("company_id", companyId)
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);

  let customer = existingCustomer;
  if (!customer) {
    const { data: newCustomer, error: createCustomerError } = await supabase
      .from("customers")
      .insert({ company_id: companyId, channel: "telegram", telegram_chat_id: chatId })
      .select("id")
      .single();
    if (createCustomerError) throw new Error(createCustomerError.message);
    customer = newCustomer;
  }

  // Most recent *open* conversation for this customer+agent -- a closed one
  // from a past rotation is never picked back up. 24h mirrors every other
  // channel's rotation window (not a Telegram-specific constraint -- Telegram
  // itself has no session window at all, this is purely about grouping
  // messages into logical conversation threads for the dashboard).
  //
  // 'paused' counts as open here too (N9's fix, applied identically to
  // resolveWhatsappSession/resolveInstagramSession/resolveWebChatSession): a
  // paused conversation is awaiting a human, not finished.
  const { data: activeConversations, error: conversationError } = await supabase
    .from("conversations")
    .select("id, updated_at")
    .eq("company_id", companyId)
    .eq("customer_id", customer.id)
    .eq("agent_id", agentId)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (conversationError) throw new Error(conversationError.message);

  let conversation: { id: string; updated_at: string } | null = activeConversations?.[0] ?? null;

  if (conversation) {
    const age = Date.now() - new Date(conversation.updated_at).getTime();
    if (age > CONVERSATION_TTL_MS) {
      const { error: closeError } = await supabase
        .from("conversations")
        .update({ status: "closed" })
        .eq("id", conversation.id);
      if (closeError) throw new Error(closeError.message);
      conversation = null;
    }
  }

  if (!conversation) {
    const { data: newConversation, error: createConversationError } = await supabase
      .from("conversations")
      .insert({ company_id: companyId, agent_id: agentId, customer_id: customer.id, channel: "telegram", status: "active" })
      .select("id, updated_at")
      .single();
    if (createConversationError) throw new Error(createConversationError.message);
    conversation = newConversation;
  }

  return { customerId: customer.id, conversationId: conversation.id };
}
