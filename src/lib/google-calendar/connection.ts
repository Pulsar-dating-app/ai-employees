import { createServiceClient } from "@/lib/supabase/service";
import { refreshAccessToken } from "./oauth";

// Trello I3 -- the single "get a usable access token for this calendar
// connection" sequence shared by availability/load.ts (freeBusy) and
// appointment-sync.ts (events): fetch the connection row (service client --
// access_token/refresh_token are column-privilege-locked), confirm it's
// actually connected, refresh an expired token and persist the refresh, and
// degrade to null on any failure.
//
// 2026-09-24 -- keyed by professional, not company: each professional has
// their own Google connection (their own account and calendar), see
// decisions.md "Multiple schedules per company".

export type UsableCalendarConnection = {
  accessToken: string;
  calendarId: string;
};

// Never throws -- null means "can't sync right now, for any reason" (not
// connected, no access_token, expired with no refresh_token, or the refresh
// call itself failed). Callers treat null as "skip Google for this
// operation," never as something to surface to the end user.
export async function getValidAccessToken(professionalId: string): Promise<UsableCalendarConnection | null> {
  try {
    const serviceClient = createServiceClient();
    const { data: connection } = await serviceClient
      .from("company_calendar_connections")
      .select("google_calendar_id, status, access_token, refresh_token, token_expires_at")
      .eq("professional_id", professionalId)
      .maybeSingle();

    if (!connection || connection.status !== "connected" || !connection.access_token) {
      return null;
    }

    let accessToken = connection.access_token as string;
    const expired =
      !connection.token_expires_at || new Date(connection.token_expires_at).getTime() <= Date.now();

    if (expired) {
      if (!connection.refresh_token) return null;
      const refreshed = await refreshAccessToken(connection.refresh_token as string);
      accessToken = refreshed.accessToken;
      await serviceClient
        .from("company_calendar_connections")
        .update({ access_token: refreshed.accessToken, token_expires_at: refreshed.tokenExpiresAt })
        .eq("professional_id", professionalId);
    }

    return { accessToken, calendarId: (connection.google_calendar_id as string) ?? "primary" };
  } catch {
    return null;
  }
}
