import { GOOGLE_CALENDAR_API_BASE_URL } from "./freebusy";

// Trello I3 -- thin wrappers over the Calendar API's events resource,
// mirroring freebusy.ts's shape. startIso/endIso are RFC3339 datetimes with
// an explicit UTC offset (our starts_at/ends_at already carry one) -- no
// separate Google `timeZone` field is needed alongside an offset-bearing
// dateTime.

function eventUrl(calendarId: string, eventId?: string): string {
  const base = `${GOOGLE_CALENDAR_API_BASE_URL}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: { summary: string; startIso: string; endIso: string; description?: string | null },
): Promise<{ id: string }> {
  const res = await fetch(eventUrl(calendarId), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: event.summary,
      ...(event.description ? { description: event.description } : {}),
      start: { dateTime: event.startIso },
      end: { dateTime: event.endIso },
    }),
  });
  if (!res.ok) throw new Error(`Google event creation failed: ${await res.text()}`);

  const { id } = (await res.json()) as { id?: string };
  if (!id) throw new Error("Google event creation returned no id");
  return { id };
}

export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: { startIso: string; endIso: string },
): Promise<void> {
  const res = await fetch(eventUrl(calendarId, eventId), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ start: { dateTime: event.startIso }, end: { dateTime: event.endIso } }),
  });
  if (!res.ok) throw new Error(`Google event update failed: ${await res.text()}`);
}

// 404/410 (the event is already gone -- deleted by hand, or a retry of this
// same operation) is treated as success, not an error. I3 does one-way sync
// only (no reverse reconciliation yet -- see the deferred future ticket),
// so a missing event self-evidently isn't there to delete; failing this
// call would be actively wrong, not just unhelpful.
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(eventUrl(calendarId, eventId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google event deletion failed: ${await res.text()}`);
  }
}
