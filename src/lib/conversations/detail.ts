import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentPhoto } from "@/lib/agents/media";

// Trello F5 -- shared between the detail page's own server-side fetch and
// the GET API route the client re-fetches through (e.g. after sending a
// reply or resuming the AI), same reasoning as list.ts.

export type ConversationDetail = {
  id: string;
  status: string;
  channel: string;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; displayName: string };
  agentName: string | null;
  agentPhotoSrc: string | null;
};

export type ConversationMessage = { role: "customer" | "agent" | "merchant"; content: string; created_at: string };

export async function getConversationDetail(
  supabase: SupabaseClient,
  companyId: string,
  conversationId: string,
): Promise<{ conversation: ConversationDetail; messages: ConversationMessage[] } | { error: string; status: number }> {
  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select(
      "id, status, channel, created_at, updated_at, agent_id, customer:customers!inner(id, name, phone), agents(slug)",
    )
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (convError) return { error: convError.message, status: 500 };
  if (!conv) return { error: "Not found", status: 404 };

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (messagesError) return { error: messagesError.message, status: 500 };

  let agentName: string | null = null;
  let agentPhotoSrc: string | null = null;
  if (conv.agent_id) {
    const slug = (conv.agents as unknown as { slug: string } | null)?.slug ?? null;
    if (slug) {
      const { data: companyAgent } = await supabase
        .from("company_agents")
        .select("name, photo_type, photo_asset_url")
        .eq("company_id", companyId)
        .eq("agent_id", conv.agent_id)
        .maybeSingle();
      agentName = companyAgent?.name ?? defaultAgentName(slug);
      agentPhotoSrc = resolveAgentPhoto(slug, companyAgent?.photo_type ?? null, companyAgent?.photo_asset_url ?? null);
    }
  }

  const customer = conv.customer as unknown as { id: string; name: string | null; phone: string | null };

  return {
    conversation: {
      id: conv.id,
      status: conv.status as string,
      channel: conv.channel as string,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      customer: {
        id: customer.id,
        displayName: customer.name ?? customer.phone ?? `Visitor ${customer.id.slice(0, 8)}`,
      },
      agentName,
      agentPhotoSrc,
    },
    messages: (messages ?? []).map((m) => ({
      role: m.role as ConversationMessage["role"],
      content: m.content,
      created_at: m.created_at,
    })),
  };
}
