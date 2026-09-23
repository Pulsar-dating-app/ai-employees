import type { SupabaseClient } from "@supabase/supabase-js";
import { isSenderOnline, type TwilioSender } from "./api";

// Writes a freshly-read Twilio sender state onto its connection row. Shared
// by the status route (lazy refresh while the merchant watches), the sync
// cron, and the connect route. Only ever moves `pending` -> `connected`:
// `connected` never regresses to `pending` here -- a sender that goes OFFLINE
// stays `connected` with `sender_status` = OFFLINE, which the send gate
// reads (decideWhatsappSendGate's senderOffline), so the dashboard can show
// "offline" instead of pretending the setup never finished.
export async function syncTwilioSender(supabase: SupabaseClient, connectionId: string, sender: TwilioSender) {
  const update: Record<string, unknown> = {
    sender_status: sender.status,
    quality_rating: sender.qualityRating,
    messaging_limit: sender.messagingLimit,
    last_synced_at: new Date().toISOString(),
  };

  if (isSenderOnline(sender)) {
    update.status = "connected";
    // connected_at marks the first time a sender went live -- don't
    // overwrite it on every 15-minute refresh.
    const { data: current } = await supabase
      .from("company_whatsapp_connections")
      .select("connected_at")
      .eq("id", connectionId)
      .maybeSingle();
    if (!current?.connected_at) update.connected_at = new Date().toISOString();
  }

  const { error } = await supabase.from("company_whatsapp_connections").update(update).eq("id", connectionId);
  if (error) throw new Error(error.message);
}
