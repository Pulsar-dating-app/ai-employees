import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cronAuthError } from "@/lib/cron/auth";
import { sendReminderForRow, REMINDER_ROW_SELECT, type ReminderRow } from "@/lib/email/appointments";

// Trello R4 -- the reminder cron, the re-scoped and actually-buildable
// version of the parked J4. Same design as N6: all the logic is here, the
// trigger is whatever calls this route with the CRON_SECRET bearer
// (pg_cron + pg_net today -- migration 20260902160000; a vercel.json cron
// entry on the same path later). Scheduled hourly.
//
// Sends "your appointment is tomorrow" for any confirmed booking starting
// within the next 25 hours that hasn't had a reminder yet, then stamps
// reminder_sent_at. Idempotent and self-healing: a missed run is caught by
// the next hourly tick (the row is still un-stamped and still inside the
// window). A booking made only a few hours ahead gets its reminder on the
// next tick rather than never.

// A little over 24h so an hourly job reliably catches every appointment
// once, and a same-day booking still gets a reminder.
const REMINDER_WINDOW_HOURS = 25;

async function handle(request: Request) {
  const authError = cronAuthError(request);
  if (authError) return authError;

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();
  const windowEnd = new Date(Date.now() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("appointments")
    .select(`id, ${REMINDER_ROW_SELECT}`)
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gt("starts_at", nowIso)
    .lte("starts_at", windowEnd);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const outcome = await sendReminderForRow(row as unknown as ReminderRow);
    if (outcome === "failed") {
      failed++;
      continue; // leave reminder_sent_at null so the next run retries
    }
    if (outcome === "sent") sent++;
    else skipped++;
    await supabase
      .from("appointments")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", (row as { id: string }).id);
  }

  return NextResponse.json({ checked: rows?.length ?? 0, sent, skipped, failed });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
