import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cronAuthError } from "@/lib/cron/auth";
import { fetchSender, isSenderOnline } from "@/lib/whatsapp/twilio/api";
import { getCompanyTwilioAccount } from "@/lib/whatsapp/twilio/accounts";
import { syncTwilioSender } from "@/lib/whatsapp/twilio/sync";

// Polls Twilio for the status of every WhatsApp sender that isn't known to be
// healthy: `pending` ones (registered, still waiting on Meta's display-name
// review) and `connected` ones whose last synced status isn't ONLINE -- plus
// a slow refresh of the healthy ones so quality rating and messaging limit
// stay current. Twilio doesn't push sender-status changes to the message
// webhooks, so this poll (scheduled every 15 minutes by
// supabase/migrations/20260923120100_whatsapp_sender_sync_cron.sql) is how a
// merchant who closed the dashboard still ends up connected.
//
// Scheduler-agnostic, secret-guarded (CRON_SECRET bearer), service-role
// throughout -- same shape as the other /api/cron/* routes. GET and POST both
// accepted so either style of scheduler works.
async function handle(request: Request) {
  const authError = cronAuthError(request);
  if (authError) return authError;

  const supabase = createServiceClient();

  const { data: connections, error } = await supabase
    .from("company_whatsapp_connections")
    .select("id, company_id, twilio_sender_sid, status")
    .eq("provider", "twilio")
    .neq("status", "disconnected")
    .not("twilio_sender_sid", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let checked = 0;
  let online = 0;
  let notOnline = 0;
  let failed = 0;

  // One credential lookup per company, not per sender.
  const accounts = new Map<string, Awaited<ReturnType<typeof getCompanyTwilioAccount>>>();

  for (const conn of connections ?? []) {
    try {
      if (!accounts.has(conn.company_id)) {
        accounts.set(conn.company_id, await getCompanyTwilioAccount(supabase, conn.company_id));
      }
      const account = accounts.get(conn.company_id);
      if (!account) {
        failed++;
        continue;
      }
      const sender = await fetchSender(account, conn.twilio_sender_sid as string);
      await syncTwilioSender(supabase, conn.id as string, sender);
      checked++;
      if (isSenderOnline(sender)) online++;
      else notOnline++;
    } catch (err) {
      // A transient Twilio/network failure proves nothing either way --
      // leave the row as-is; the next run tries again.
      console.error("WhatsApp sender sync failed for a connection", { connectionId: conn.id, err });
      failed++;
    }
  }

  return NextResponse.json({ checked, online, notOnline, failed });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
