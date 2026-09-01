import type { SupabaseClient } from "@supabase/supabase-js";

// Trello M3 -- find-or-create the customer for an anonymous web chat
// visitor's session id, find-or-rotate their active conversation. Same
// find-or-create-customer / find-or-rotate-conversation shape as the dev-only
// src/app/api/companies/[companyId]/agents/[agentSlug]/dev-chat-test/route.ts
// -- deliberately NOT extracted into something both files share:
// dev-chat-test is test-only scaffolding tied to its own deletion condition
// (D2 shipping, a different epic), not this ticket's call to touch.
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

export type WebChatSession = { customerId: string; conversationId: string };

export async function resolveWebChatSession(
  supabase: SupabaseClient,
  companyId: string,
  agentId: string,
  sessionId: string,
): Promise<WebChatSession> {
  const { data: existingCustomer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("company_id", companyId)
    .eq("web_chat_session_id", sessionId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);

  let customer = existingCustomer;
  if (!customer) {
    const { data: newCustomer, error: createCustomerError } = await supabase
      .from("customers")
      .insert({ company_id: companyId, channel: "web_chat", web_chat_session_id: sessionId })
      .select("id")
      .single();
    if (createCustomerError) throw new Error(createCustomerError.message);
    customer = newCustomer;
  }

  // Most recent *open* conversation for this customer+agent -- a closed
  // one from a past rotation is never picked back up. Same 24h staleness
  // window as dev-chat-test (WhatsApp's own customer-service session
  // window, not an arbitrary number).
  //
  // 'paused' (F5) counts as open here, not just 'active': a paused
  // conversation is awaiting a human, not finished -- excluding it would
  // mean the customer's very next message silently orphans it into a
  // brand-new conversation instead of continuing the one a merchant may
  // already be looking at.
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
      .insert({ company_id: companyId, agent_id: agentId, customer_id: customer.id, channel: "web_chat", status: "active" })
      .select("id, updated_at")
      .single();
    if (createConversationError) throw new Error(createConversationError.message);
    conversation = newConversation;
  }

  return { customerId: customer.id, conversationId: conversation.id };
}
