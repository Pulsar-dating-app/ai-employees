import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultAgentName } from "@/lib/agents/naming";

// Trello F5 -- shared between the Conversations page's own server-side
// first fetch (page.tsx) and the API route (GET
// /api/companies/[companyId]/conversations) the client refetches through
// for filtering/pagination. Extracted specifically so those two call sites
// can never drift into returning differently-shaped rows for the same
// query -- the enrichment here (agent display name, last-message preview,
// customer fallback identity) is real logic, not a flat column select the
// way Products' PRODUCT_PUBLIC_COLUMNS is.

export type ConversationRow = {
  id: string;
  status: string;
  updatedAt: string;
  customer: { id: string; displayName: string };
  agentName: string | null;
  lastMessage: { content: string; created_at: string } | null;
};

export type ConversationListFilters = {
  status?: "paused" | "active" | "closed" | null;
  search?: string | null;
  page: number;
  pageSize: number;
};

export async function listConversations(
  supabase: SupabaseClient,
  companyId: string,
  filters: ConversationListFilters,
): Promise<{ rows: ConversationRow[]; total: number } | { error: string }> {
  let query = supabase
    .from("conversations")
    .select("id, agent_id, status, updated_at, customer:customers!inner(id, name, phone)", { count: "exact" })
    .eq("company_id", companyId)
    .eq("channel", "web_chat");

  if (filters.status) query = query.eq("status", filters.status);
  // customers.name/phone are effectively always null for web chat today (no
  // name-collection step exists yet) -- this filter is real and correct, it
  // just won't match anything meaningful until a future ticket adds
  // identity collection. The list UI discloses this rather than pretending
  // search is fully functional.
  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`, {
      referencedTable: "customer",
    });
  }

  const from = (filters.page - 1) * filters.pageSize;
  const { data: conversations, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(from, from + filters.pageSize - 1);
  if (error) return { error: error.message };

  const conversationIds = (conversations ?? []).map((c) => c.id);
  const agentIds = [...new Set((conversations ?? []).map((c) => c.agent_id).filter((id): id is string => id !== null))];

  const [{ data: latestMessages }, { data: companyAgents }] = await Promise.all([
    conversationIds.length > 0
      ? supabase
          .from("messages")
          .select("conversation_id, content, created_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { conversation_id: string; content: string; created_at: string }[] }),
    agentIds.length > 0
      ? supabase
          .from("company_agents")
          .select("agent_id, name, agents(slug)")
          .eq("company_id", companyId)
          .in("agent_id", agentIds)
      : Promise.resolve({ data: [] as { agent_id: string; name: string | null; agents: unknown }[] }),
  ]);

  // Sorted desc above, so the first row seen per conversation_id is its
  // most recent message -- no per-row subquery needed.
  const latestByConversation = new Map<string, { content: string; created_at: string }>();
  for (const m of latestMessages ?? []) {
    if (!latestByConversation.has(m.conversation_id)) {
      latestByConversation.set(m.conversation_id, { content: m.content, created_at: m.created_at });
    }
  }

  const agentNameById = new Map<string, string>();
  for (const ca of companyAgents ?? []) {
    const slug = (ca.agents as unknown as { slug: string } | null)?.slug;
    if (slug) agentNameById.set(ca.agent_id, ca.name ?? defaultAgentName(slug));
  }

  const rows: ConversationRow[] = (conversations ?? []).map((c) => {
    const customer = c.customer as unknown as { id: string; name: string | null; phone: string | null };
    return {
      id: c.id,
      status: c.status as string,
      updatedAt: c.updated_at,
      customer: {
        id: customer.id,
        // The one, stable, always-available fallback identity -- not a
        // real name (see the module comment above).
        displayName: customer.name ?? customer.phone ?? `Visitor ${customer.id.slice(0, 8)}`,
      },
      agentName: c.agent_id ? (agentNameById.get(c.agent_id) ?? null) : null,
      lastMessage: latestByConversation.get(c.id) ?? null,
    };
  });

  return { rows, total: count ?? 0 };
}
