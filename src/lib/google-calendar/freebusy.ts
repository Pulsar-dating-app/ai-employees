// Trello I2 -- wraps Google's freeBusy.query endpoint. Kept separate from
// oauth.ts (token exchange/refresh) since this is a different concern with
// its own base URL override.
//
// GOOGLE_CALENDAR_API_BASE_URL lets tests point this at a local mock instead
// of the real Google endpoint, same reasoning as GOOGLE_OAUTH_TOKEN_URL/
// META_GRAPH_API_BASE_URL (the route runs in a separately-spawned `next dev`
// process that can't share an in-process fetch mock with the test runner).
// Exported for events.ts (Trello I3) to reuse -- both files hit the same
// Google Calendar API host, so this is one real shared constant, not
// per-file duplication of unrelated config.
export const GOOGLE_CALENDAR_API_BASE_URL =
  process.env.GOOGLE_CALENDAR_API_BASE_URL ?? "https://www.googleapis.com";

export interface FreeBusyInterval {
  start: string; // ISO UTC
  end: string; // ISO UTC
}

// timeMin/timeMax must be ISO datetimes. Returns the busy intervals Google
// reports for `calendarId` -- callers merge these with our own appointments
// before handing them to the pure engine (engine.ts doesn't know or care
// where a busy interval came from).
export async function queryFreeBusy(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<FreeBusyInterval[]> {
  const res = await fetch(`${GOOGLE_CALENDAR_API_BASE_URL}/calendar/v3/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }),
  });
  if (!res.ok) throw new Error(`Google freeBusy query failed: ${await res.text()}`);

  const body = (await res.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>;
  };
  const calendar = body.calendars?.[calendarId];
  if (calendar?.errors?.length) {
    throw new Error(`Google freeBusy query returned errors for ${calendarId}`);
  }
  return calendar?.busy ?? [];
}
