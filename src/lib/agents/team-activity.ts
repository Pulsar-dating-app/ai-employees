import type { SupabaseClient } from "@supabase/supabase-js";
import { findUnconfirmedConversationIds } from "@/lib/conversations/pending";

export const TEAM_ACTIVITY_WINDOW_DAYS = 7;

export type TeamActivity = { conversations: number; needsYou: number };

export type ActivityConversationRow = {
  id: string;
  agent_id: string | null;
  status: string;
  updated_at: string;
};

export function summarizeTeamActivity(
  rows: readonly ActivityConversationRow[],
  pendingIds: Iterable<string>,
  sinceMs: number,
): Map<string, TeamActivity> {
  const pending = new Set(pendingIds);
  const byAgent = new Map<string, TeamActivity>();
  for (const row of rows) {
    if (!row.agent_id) continue;
    const entry = byAgent.get(row.agent_id) ?? { conversations: 0, needsYou: 0 };
    if (new Date(row.updated_at).getTime() >= sinceMs) entry.conversations += 1;
    if (row.status !== "closed" && (row.status === "paused" || pending.has(row.id))) entry.needsYou += 1;
    byAgent.set(row.agent_id, entry);
  }
  return byAgent;
}

export async function getTeamActivity(
  supabase: SupabaseClient,
  companyId: string,
  now: Date = new Date(),
): Promise<Map<string, TeamActivity>> {
  const sinceMs = now.getTime() - TEAM_ACTIVITY_WINDOW_DAYS * 86_400_000;
  const since = new Date(sinceMs).toISOString();

  const pendingIds = await findUnconfirmedConversationIds(supabase, companyId);
  const filters = [`updated_at.gte.${since}`, "status.eq.paused"];
  if (pendingIds.length > 0) filters.push(`id.in.(${pendingIds.join(",")})`);

  const { data } = await supabase
    .from("conversations")
    .select("id, agent_id, status, updated_at")
    .eq("company_id", companyId)
    .eq("is_preview", false)
    .or(filters.join(","));

  return summarizeTeamActivity((data ?? []) as ActivityConversationRow[], pendingIds, sinceMs);
}
