import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { refreshLongLivedToken } from "@/lib/instagram/meta-instagram-api";
import { cronAuthError } from "@/lib/cron/auth";

// Trello N6 -- renews Instagram long-lived tokens before they lapse.
//
// Scheduler-agnostic by design (see decisions.md 2026-09-02): all the
// logic is here, and the trigger is whatever calls this route with the
// right bearer. Today that's Supabase pg_cron + pg_net
// (supabase/migrations/20260902102416_instagram_token_refresh_cron.sql);
// moving to Vercel Cron later is a vercel.json crons entry pointing at this
// same path, no change here. Accepts GET and POST so either style of
// scheduler works (Vercel Cron sends GET; the pg_net job sends POST).
//
// Public surface, secret-guarded not session-guarded -- excluded from
// src/proxy.ts's session-refresh matcher, same as api/webhooks/. Uses the
// service-role client throughout: company_instagram_connections.access_token
// is column-privilege-locked (N1) and unreadable by any regular client,
// and there is no merchant session on a cron request anyway.

// Refresh anything expiring within this many days. Wide on purpose (token
// life is 60 days): a single missed run is then self-healing, because the
// next day's run still catches every token in the window. This is what
// makes the choice of scheduler and its timing precision not matter.
const REFRESH_WINDOW_DAYS = 7;

async function handle(request: Request) {
  const authError = cronAuthError(request);
  if (authError) return authError;

  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // A row with token_expires_at IS NULL is excluded by the `.lt` filter
  // itself -- an unknown expiry can't be reasoned about, so it's left
  // alone rather than guessed at.
  const { data: connections, error } = await supabase
    .from("company_instagram_connections")
    .select("id, access_token, token_expires_at")
    .eq("status", "connected")
    .not("access_token", "is", null)
    .lt("token_expires_at", cutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let refreshed = 0;
  let disconnected = 0;

  for (const conn of connections ?? []) {
    try {
      const { accessToken, tokenExpiresAt } = await refreshLongLivedToken(conn.access_token as string);
      const { error: updateError } = await supabase
        .from("company_instagram_connections")
        .update({ access_token: accessToken, token_expires_at: tokenExpiresAt })
        .eq("id", conn.id);
      if (updateError) throw new Error(updateError.message);
      refreshed++;
    } catch {
      // A failed refresh means the token is unrecoverable -- expired past
      // the point Meta will renew it, or revoked by the merchant on
      // Instagram. Flip to disconnected (same shape as the connect route's
      // release path) so N3's card shows a real reconnect prompt instead
      // of a silently dead employee.
      await supabase
        .from("company_instagram_connections")
        .update({ status: "disconnected", access_token: null, token_expires_at: null })
        .eq("id", conn.id);
      disconnected++;
    }
  }

  return NextResponse.json({
    checked: connections?.length ?? 0,
    refreshed,
    disconnected,
  });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
