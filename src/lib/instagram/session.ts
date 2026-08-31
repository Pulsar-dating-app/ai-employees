import type { SupabaseClient } from "@supabase/supabase-js";

// Trello N4 -- find-or-create the customer for an inbound Instagram DM's
// sender, find-or-rotate their active conversation. Deliberately a sibling
// of src/lib/web-chat/session.ts, not a shared helper -- same reasoning
// that file's own comment gives for not sharing with dev-chat-test: each
// channel's session logic is tied to its own epic and its own identity
// column (web_chat_session_id there, instagram_user_id here), not to a
// common abstraction worth maintaining for two-and-growing callers.
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

export type InstagramSession = { customerId: string; conversationId: string };

export async function resolveInstagramSession(
  supabase: SupabaseClient,
  companyId: string,
  agentId: string,
  senderIgsid: string,
): Promise<InstagramSession> {
  const { data: existingCustomer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("company_id", companyId)
    .eq("instagram_user_id", senderIgsid)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);

  let customer = existingCustomer;
  if (!customer) {
    const { data: newCustomer, error: createCustomerError } = await supabase
      .from("customers")
      .insert({ company_id: companyId, channel: "instagram", instagram_user_id: senderIgsid })
      .select("id")
      .single();
    if (createCustomerError) throw new Error(createCustomerError.message);
    customer = newCustomer;
  }

  // Most recent *active* conversation for this customer+agent -- a closed
  // one from a past rotation is never picked back up. Same 24h staleness
  // window web chat and dev-chat-test both use (WhatsApp's own
  // customer-service session window, not an arbitrary number) -- and not a
  // coincidence here either: it's also exactly Instagram's own messaging
  // window, so a conversation rotates right as the ability to freely reply
  // to it would otherwise lapse.
  const { data: activeConversations, error: conversationError } = await supabase
    .from("conversations")
    .select("id, updated_at")
    .eq("company_id", companyId)
    .eq("customer_id", customer.id)
    .eq("agent_id", agentId)
    .eq("status", "active")
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
      .insert({ company_id: companyId, agent_id: agentId, customer_id: customer.id, channel: "instagram", status: "active" })
      .select("id, updated_at")
      .single();
    if (createConversationError) throw new Error(createConversationError.message);
    conversation = newConversation;
  }

  return { customerId: customer.id, conversationId: conversation.id };
}
