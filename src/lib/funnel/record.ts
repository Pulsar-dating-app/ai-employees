import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeFunnelProperties, type FunnelEvent, type FunnelProperties } from "./events";

// Server-side write of one funnel event with the merchant's own client: RLS
// only lets them record as themselves, into a company they belong to. Never
// throws -- measuring the funnel must not break the thing being measured.
export async function recordFunnelEvent(
  supabase: SupabaseClient,
  event: FunnelEvent,
  properties: FunnelProperties = {},
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // RLS scopes this to the caller's own company (one per account).
    const { data: companies } = await supabase.from("companies").select("id").limit(1);
    const { error } = await supabase.from("funnel_events").insert({
      company_id: (companies?.[0] as { id: string } | undefined)?.id ?? null,
      user_id: user.id,
      event,
      properties: sanitizeFunnelProperties(properties),
    });
    if (error) console.error("[funnel] could not record event", { event, code: error.code, message: error.message });
  } catch (err) {
    console.error("[funnel] could not record event", { event, err });
  }
}
