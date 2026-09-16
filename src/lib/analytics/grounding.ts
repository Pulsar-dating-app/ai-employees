import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroundingCounts } from "@/lib/chat/grounding";
import { addDays, isValidTimeZone } from "./load";

const STATUS_PATH = "metadata->grounding->>status";
const CLAIMS_PATH = "metadata->grounding->claims";

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

async function countReplies(
  supabase: SupabaseClient,
  companyId: string,
  startUtc: string,
  endUtc: string,
  agentId: string | null | undefined,
  status: string,
  onlyWithClaims: boolean,
): Promise<number> {
  const columns = "id, conversations!inner(agent_id, is_preview)";
  let query = supabase
    .from("messages")
    .select(columns, { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("role", "agent")
    .gte("created_at", startUtc)
    .lt("created_at", endUtc)
    .eq(STATUS_PATH, status);

  // Rows written before claims existed have no `claims` key at all, so this
  // also excludes them rather than counting them as verified on faith.
  if (onlyWithClaims) query = query.gt(CLAIMS_PATH, 0);
  if (agentId) query = query.eq("conversations.agent_id", agentId);
  query = query.eq("conversations.is_preview", false);

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

  const [verified, regenerated, blocked] = await Promise.all([
    countReplies(supabase, companyId, startUtc, endUtc, agentId, "grounded", true),
    countReplies(supabase, companyId, startUtc, endUtc, agentId, "regenerated", false),
    countReplies(supabase, companyId, startUtc, endUtc, agentId, "blocked", false),
  ]);

  return { verified, regenerated, blocked };
}
