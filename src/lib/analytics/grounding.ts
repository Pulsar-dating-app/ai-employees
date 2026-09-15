import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroundingCounts } from "@/lib/chat/grounding";
import { addDays, isValidTimeZone } from "./load";

const STATUS_PATH = "metadata->grounding->>status";

export function localMidnightUtc(dateOnly: string, timezone: string | null): string {
  const tz = timezone && isValidTimeZone(timezone) ? timezone : "UTC";
  const naive = new Date(`${dateOnly}T00:00:00Z`);
  const shown = new Date(naive.toLocaleString("en-US", { timeZone: tz }));
  const utc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(naive.getTime() - (shown.getTime() - utc.getTime())).toISOString();
}

export function localDayRangeUtc(
  from: string,
  to: string,
  timezone: string | null,
): { startUtc: string; endUtc: string } {
  return {
    startUtc: localMidnightUtc(from, timezone),
    endUtc: localMidnightUtc(addDays(to, 1), timezone),
  };
}

async function countWithStatus(
  supabase: SupabaseClient,
  companyId: string,
  startUtc: string,
  endUtc: string,
  agentId: string | null | undefined,
  status: string | null,
): Promise<number> {
  const columns = agentId ? "id, conversations!inner(agent_id)" : "id";
  let query = supabase
    .from("messages")
    .select(columns, { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("role", "agent")
    .gte("created_at", startUtc)
    .lt("created_at", endUtc);

  query = status === null ? query.not(STATUS_PATH, "is", null) : query.eq(STATUS_PATH, status);
  if (agentId) query = query.eq("conversations.agent_id", agentId);

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

export async function loadGroundingCounts(opts: {
  supabase: SupabaseClient;
  companyId: string;
  startUtc: string;
  endUtc: string;
  agentId?: string | null;
}): Promise<GroundingCounts> {
  const { supabase, companyId, startUtc, endUtc, agentId } = opts;

  const [checked, regenerated, blocked] = await Promise.all([
    countWithStatus(supabase, companyId, startUtc, endUtc, agentId, null),
    countWithStatus(supabase, companyId, startUtc, endUtc, agentId, "regenerated"),
    countWithStatus(supabase, companyId, startUtc, endUtc, agentId, "blocked"),
  ]);

  return { checked, grounded: Math.max(0, checked - regenerated - blocked), regenerated, blocked };
}
