import type { SupabaseClient } from "@supabase/supabase-js";

// Trello M3 -- three independent rate-limit checks for the public chat API,
// all POST-only (sending a message is the only thing that costs a real
// OpenAI call; GET/history has nothing to protect). WhatsApp's own natural
// cost brake -- spamming a business requires a phone number -- has no
// equivalent here, so this is the deliberate replacement. See decisions.md.

export const IP_RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };
export const CONVERSATION_RATE_LIMIT = { maxMessages: 10, windowMs: 60_000 };
export const CONVERSATION_HARD_CAP = 200;

export type RateLimitResult = { allowed: true } | { allowed: false; reason: string };

// Reads the first entry of x-forwarded-for (set by any real proxy/CDN in
// front of this app). Falls back to a single shared "unknown" bucket when
// absent (e.g. local dev with no proxy) -- an accepted degrade, not a gap
// worth chasing for a bucket that only ever matters behind a real deployment.
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Checked first (cheapest, no conversation needed yet) -- records a hit
// immediately once allowed, *before* AgentEngine.run() is ever called, so a
// failed or retried attempt still counts against the window. Closes the
// obvious "induce a failure to dodge the limit" loophole.
export async function checkAndRecordIpRateLimit(
  supabase: SupabaseClient,
  ip: string,
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - IP_RATE_LIMIT.windowMs).toISOString();
  const { count, error } = await supabase
    .from("chat_ip_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", windowStart);
  if (error) throw new Error(error.message);

  if ((count ?? 0) >= IP_RATE_LIMIT.maxRequests) {
    return { allowed: false, reason: "Too many requests from this network, please slow down." };
  }

  const { error: insertError } = await supabase.from("chat_ip_rate_limits").insert({ ip });
  if (insertError) throw new Error(insertError.message);

  return { allowed: true };
}

// Both conversation-scoped checks reuse `messages` directly -- no separate
// table needed, the row already exists the moment a message is sent.
export async function checkConversationRateLimit(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - CONVERSATION_RATE_LIMIT.windowMs).toISOString();
  const { count: recentCount, error: recentError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "customer")
    .gte("created_at", windowStart);
  if (recentError) throw new Error(recentError.message);

  if ((recentCount ?? 0) >= CONVERSATION_RATE_LIMIT.maxMessages) {
    return { allowed: false, reason: "Too many messages, please slow down." };
  }

  // Hard cap: a circuit breaker, not meant to be hit in ordinary use -- no
  // time bound, just a lifetime total for this one conversation.
  const { count: totalCount, error: totalError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "customer");
  if (totalError) throw new Error(totalError.message);

  if ((totalCount ?? 0) >= CONVERSATION_HARD_CAP) {
    return { allowed: false, reason: "This conversation has reached its message limit." };
  }

  return { allowed: true };
}
