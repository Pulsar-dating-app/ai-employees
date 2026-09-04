import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkWhatsappEligibility } from "@/lib/whatsapp/meta-graph-api";
import { cronAuthError } from "@/lib/cron/auth";

// Trello D5 -- re-checks connections currently flagged has_payment_issue, so
// a merchant who fixes their payment method in Meta Business Manager gets
// unblocked without needing to disconnect/reconnect.
//
// Scheduler-agnostic by design (same shape as N6's refresh-tokens route):
// all the logic is here, and the trigger is whatever calls this route with
// the right bearer. Today that's Supabase pg_cron + pg_net
// (supabase/migrations/20260905090300_whatsapp_eligibility_recheck_cron.sql).
// Accepts GET and POST so either style of scheduler works.
//
// Public surface, secret-guarded not session-guarded -- excluded from
// src/proxy.ts's session-refresh matcher, same as api/webhooks/ and
// api/cron/instagram/. Uses the service-role client throughout:
// access_token is column-privilege-locked and there is no merchant session
// on a cron request anyway.
//
// Caveat, carried from checkWhatsappEligibility's own doc comment: this can
// only prove the WABA is reachable, not that a real send would succeed --
// Meta has no single confirmed "billing eligibility" field to poll. The
// reliable signal is the opportunistic one in the webhook (D4's send
// reporting error 131042); this cron is a best-effort supplement so a fixed
// account doesn't stay flagged forever, not a source of truth on its own.
async function handle(request: Request) {
  const authError = cronAuthError(request);
  if (authError) return authError;

  const supabase = createServiceClient();

  const { data: connections, error } = await supabase
    .from("company_whatsapp_connections")
    .select("id, phone_number_id, access_token")
    .eq("status", "connected")
    .eq("has_payment_issue", true)
    .not("access_token", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let cleared = 0;
  let stillFlagged = 0;

  for (const conn of connections ?? []) {
    try {
      const result = await checkWhatsappEligibility(conn.access_token as string, conn.phone_number_id as string);
      if (result.ok) {
        await supabase
          .from("company_whatsapp_connections")
          .update({ has_payment_issue: false, payment_issue_detected_at: null })
          .eq("id", conn.id);
        cleared++;
      } else {
        stillFlagged++;
      }
    } catch {
      // A network/transient failure proves nothing either way -- leave the
      // flag as-is rather than guess. The next day's run tries again.
      stillFlagged++;
    }
  }

  return NextResponse.json({ checked: connections?.length ?? 0, cleared, stillFlagged });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
