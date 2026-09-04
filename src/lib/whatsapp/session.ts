import type { SupabaseClient } from "@supabase/supabase-js";

// Trello D2 -- find-or-create the customer for an inbound WhatsApp message's
// sender, find-or-rotate their active conversation. A sibling of
// src/lib/instagram/session.ts, not a shared helper -- same reasoning that
// file's own comment gives: each channel's session logic is tied to its own
// identity column (phone here, instagram_user_id there), not to a common
// abstraction worth maintaining for two callers.
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

export type WhatsappSession = { customerId: string; conversationId: string };

export async function resolveWhatsappSession(
  supabase: SupabaseClient,
  companyId: string,
  agentId: string,
  phone: string,
): Promise<WhatsappSession> {
  const { data: existingCustomer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("company_id", companyId)
    .eq("channel", "whatsapp")
    .eq("phone", phone)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);

  let customer = existingCustomer;
  if (!customer) {
    const { data: newCustomer, error: createCustomerError } = await supabase
      .from("customers")
      .insert({ company_id: companyId, channel: "whatsapp", phone })
      .select("id")
      .single();
    if (createCustomerError) throw new Error(createCustomerError.message);
    customer = newCustomer;
  }

  // Most recent *open* conversation for this customer+agent -- a closed one
  // from a past rotation is never picked back up. 24h mirrors WhatsApp's own
  // customer-service session window (same TTL web chat and Instagram use).
  //
  // 'paused' counts as open here too (N9's fix, applied identically to
  // resolveInstagramSession/resolveWebChatSession): a paused conversation is
  // awaiting a human, not finished -- excluding it would let the customer's
  // very next message silently orphan it into a brand-new 'active'
  // conversation, and the webhook's own paused-gate would never fire.
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
      .insert({ company_id: companyId, agent_id: agentId, customer_id: customer.id, channel: "whatsapp", status: "active" })
      .select("id, updated_at")
      .single();
    if (createConversationError) throw new Error(createConversationError.message);
    conversation = newConversation;
  }

  return { customerId: customer.id, conversationId: conversation.id };
}
