import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_SCANNED_BLOCKED = 500;

type MessageRow = { conversation_id: string; created_at: string };

function latestByConversation(rows: readonly MessageRow[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    if (!latest.has(row.conversation_id)) latest.set(row.conversation_id, row.created_at);
  }
  return latest;
}

export async function findUnconfirmedConversationIds(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string[]> {
  const { data: blockedRaw, error: blockedError } = await supabase
    .from("messages")
    .select("conversation_id, created_at")
    .eq("company_id", companyId)
    .eq("metadata->grounding->>status", "blocked")
    .order("created_at", { ascending: false })
    .limit(MAX_SCANNED_BLOCKED);
  if (blockedError || !blockedRaw || blockedRaw.length === 0) return [];

  const latestBlocked = latestByConversation(blockedRaw as MessageRow[]);
  const candidateIds = [...latestBlocked.keys()];

  const [{ data: merchantRaw }, { data: conversationsRaw }] = await Promise.all([
    supabase
      .from("messages")
      .select("conversation_id, created_at")
      .in("conversation_id", candidateIds)
      .eq("role", "merchant")
      .order("created_at", { ascending: false }),
    supabase.from("conversations").select("id, status").in("id", candidateIds),
  ]);

  const latestMerchant = latestByConversation((merchantRaw ?? []) as MessageRow[]);
  const closed = new Set(
    ((conversationsRaw ?? []) as { id: string; status: string }[])
      .filter((c) => c.status === "closed")
      .map((c) => c.id),
  );

  return candidateIds.filter((id) => {
    if (closed.has(id)) return false;
    const answeredAt = latestMerchant.get(id);
    return !answeredAt || answeredAt < latestBlocked.get(id)!;
  });
}
