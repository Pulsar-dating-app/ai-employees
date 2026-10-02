import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteWhatsappSender } from "@/lib/whatsapp/twilio-api";
import { getCompanyTwilioCredentials } from "@/lib/whatsapp/twilio-subaccounts";

// A company moved to a plan that doesn't pay for Twilio (off a `_wpp`
// variant): Staffra would otherwise keep paying Meta and Twilio for its
// numbers. Each live Twilio number is deleted on Twilio and disconnected
// with `disconnect_reason = 'plan_changed'`, so the channel screen can tell
// the merchant to reconnect it on their own Meta account. A sender Twilio
// refuses to delete is left as is and retried on the next billing sync; the
// plan gate already keeps it silent meanwhile.
export async function releaseTwilioNumbersOffPlan(service: SupabaseClient, companyId: string): Promise<void> {
  const { data: rows } = await service
    .from("company_whatsapp_connections")
    .select("id, twilio_sender_sid")
    .eq("company_id", companyId)
    .eq("provider", "twilio")
    .neq("status", "disconnected");
  if (!rows || rows.length === 0) return;

  const credentials = await getCompanyTwilioCredentials(service, companyId).catch(() => null);
  for (const row of rows) {
    if (row.twilio_sender_sid) {
      if (!credentials) {
        console.error(`plan change: no Twilio credentials to release company ${companyId}'s numbers`);
        return;
      }
      try {
        await deleteWhatsappSender(credentials, row.twilio_sender_sid as string);
      } catch (err) {
        console.error(`plan change: Twilio sender ${row.twilio_sender_sid} deletion failed`, err);
        continue;
      }
    }
    const { error } = await service
      .from("company_whatsapp_connections")
      .update({
        status: "disconnected",
        access_token: null,
        token_expires_at: null,
        twilio_sender_sid: null,
        disconnect_reason: "plan_changed",
      })
      .eq("id", row.id);
    if (error) console.error(`plan change: could not disconnect WhatsApp connection ${row.id}`, error);
  }
}
