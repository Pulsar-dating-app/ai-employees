import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultAgentName } from "@/lib/agents/naming";
import { resolveAgentPhoto } from "@/lib/agents/media";
import { readGrounding } from "@/lib/chat/grounding";
import { findUnconfirmedConversationIds } from "./pending";

// Trello F5 -- shared between the Conversations page's own server-side
// first fetch (page.tsx) and the API route (GET
// /api/companies/[companyId]/conversations) the client refetches through
// for filtering/pagination. Extracted specifically so those two call sites
// can never drift into returning differently-shaped rows for the same
// query -- the enrichment here (agent display name, last-message preview,
// customer fallback identity) is real logic, not a flat column select the
// way Products' PRODUCT_PUBLIC_COLUMNS is.

// The strongest signal wins when a conversation has both: a customer who
// actually clicked through to checkout is a step further along than one who
// only said they wanted to buy. Never a sale (spec §14/§15) -- this is
// "worth your attention first", not "this converted".
export type HotSignal = "checkout_click" | "buying_intent" | null;

export type ConversationRow = {
  id: string;
  status: string;
  channel: string;
  updatedAt: string;
  customer: { id: string; displayName: string };
  agentName: string | null;
  agentPhotoSrc: string | null;
  lastMessage: { content: string; created_at: string; role: string } | null;
  pendingConfirmation: boolean;
  hotSignal: HotSignal;
};

type LatestMessageRow = {
  conversation_id: string;
  content: string;
  created_at: string;
  role: string;
  metadata: unknown;
};

export type ConversationListFilters = {
  status?: "paused" | "active" | "closed" | null;
  search?: string | null;
  pendingOnly?: boolean;
  page: number;
  pageSize: number;
};

export async function listConversations(
  supabase: SupabaseClient,
  companyId: string,
  filters: ConversationListFilters,
): Promise<{ rows: ConversationRow[]; total: number } | { error: string }> {
  // N10: every channel, not just web chat -- the human-takeover inbox has
  // to surface a paused Instagram conversation too. F5's original web-chat
  // scope is gone; `channel` now travels on each row so the UI can badge it.
  let query = supabase
    .from("conversations")
    .select("id, agent_id, status, channel, updated_at, customer:customers!inner(id, name, phone)", { count: "exact" })
    .eq("company_id", companyId)
    // The first session's rehearsal is not a customer conversation, and the
    // inbox is a work queue -- one seeded thread at the top of it every time
    // a merchant logs in is noise, not history.
    .eq("is_preview", false);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.pendingOnly) {
    const pendingIds = await findUnconfirmedConversationIds(supabase, companyId);
    if (pendingIds.length === 0) return { rows: [], total: 0 };
    query = query.in("id", pendingIds);
  }
  // customers.name/phone are effectively always null today (no
  // name-collection step exists on any channel yet) -- this filter is real
  // and correct, it just won't match anything meaningful until a future
  // ticket adds identity collection. The list UI discloses this rather than
  // pretending search is fully functional.
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

  const [{ data: latestMessages }, { data: companyAgents }, { data: hotEvents }] = await Promise.all([
    conversationIds.length > 0
      ? supabase
          .from("messages")
          .select("conversation_id, content, created_at, role, metadata")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as LatestMessageRow[] }),
    agentIds.length > 0
      ? supabase
          .from("company_agents")
          .select("agent_id, name, photo_type, photo_asset_url, agents(slug)")
          .eq("company_id", companyId)
          .in("agent_id", agentIds)
      : Promise.resolve({
          data: [] as {
            agent_id: string;
            name: string | null;
            photo_type: string | null;
            photo_asset_url: string | null;
            agents: unknown;
          }[],
        }),
    // Same events table Metrics' buying-intent/checkout-click totals already
    // aggregate from (src/lib/analytics/aggregate.ts) -- read here per row
    // instead of only ever summed on another page the merchant has to think
    // to go check.
    conversationIds.length > 0
      ? supabase
          .from("events")
          .select("conversation_id, type")
          .eq("company_id", companyId)
          .in("conversation_id", conversationIds)
          .in("type", ["buying_intent", "checkout_click"])
      : Promise.resolve({ data: [] as { conversation_id: string; type: string }[] }),
  ]);

  // Sorted desc above, so the first row seen per conversation_id is its
  // most recent message -- no per-row subquery needed.
  const latestByConversation = new Map<string, { content: string; created_at: string; role: string }>();
  const pendingByConversation = new Map<string, boolean>();
  for (const m of (latestMessages ?? []) as LatestMessageRow[]) {
    if (!latestByConversation.has(m.conversation_id)) {
      latestByConversation.set(m.conversation_id, { content: m.content, created_at: m.created_at, role: m.role });
    }
    if (pendingByConversation.has(m.conversation_id)) continue;
    if (m.role === "merchant") {
      pendingByConversation.set(m.conversation_id, false);
    } else if (m.role === "agent" && readGrounding(m.metadata)?.status === "blocked") {
      pendingByConversation.set(m.conversation_id, true);
    }
  }

  // checkout_click beats buying_intent regardless of which happened first --
  // an actual click is further along than a spoken "I want this".
  const hotSignalByConversation = new Map<string, HotSignal>();
  for (const e of (hotEvents ?? []) as { conversation_id: string; type: string }[]) {
    if (e.type !== "buying_intent" && e.type !== "checkout_click") continue;
    const current = hotSignalByConversation.get(e.conversation_id);
    if (current === "checkout_click") continue;
    hotSignalByConversation.set(e.conversation_id, e.type as HotSignal);
  }

  const agentNameById = new Map<string, string>();
  const agentPhotoById = new Map<string, string | null>();
  for (const ca of companyAgents ?? []) {
    const slug = (ca.agents as unknown as { slug: string } | null)?.slug;
    if (!slug) continue;
    agentNameById.set(ca.agent_id, ca.name ?? defaultAgentName(slug));
    agentPhotoById.set(ca.agent_id, resolveAgentPhoto(slug, ca.photo_type ?? null, ca.photo_asset_url ?? null));
  }

  const rows: ConversationRow[] = (conversations ?? []).map((c) => {
    const customer = c.customer as unknown as { id: string; name: string | null; phone: string | null };
    return {
      id: c.id,
      status: c.status as string,
      channel: c.channel as string,
      updatedAt: c.updated_at,
      customer: {
        id: customer.id,
        // The one, stable, always-available fallback identity -- not a
        // real name (see the module comment above).
        displayName: customer.name ?? customer.phone ?? `Visitor ${customer.id.slice(0, 8)}`,
      },
      agentName: c.agent_id ? (agentNameById.get(c.agent_id) ?? null) : null,
      agentPhotoSrc: c.agent_id ? (agentPhotoById.get(c.agent_id) ?? null) : null,
      lastMessage: latestByConversation.get(c.id) ?? null,
      pendingConfirmation: c.status !== "closed" && (pendingByConversation.get(c.id) ?? false),
      hotSignal: hotSignalByConversation.get(c.id) ?? null,
    };
  });

  return { rows, total: count ?? 0 };
}
