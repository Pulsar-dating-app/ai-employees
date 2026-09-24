import { GOOGLE_CALENDAR_API_BASE_URL } from "./freebusy";

// 2026-09-24 -- lets whoever connects a professional's Google account pick
// which of that account's calendars holds the professional's appointments
// (the barbershop owner connecting their own account once per barber and
// giving each barber a calendar; a partner in a clinic using their own
// primary calendar), or create a dedicated one. Both use the
// `auth/calendar` scope the connect flow already requests.

export type GoogleCalendarSummary = {
  id: string;
  name: string;
  primary: boolean;
};

// Only calendars we can write events into -- a read-only calendar (a
// colleague's shared view, a holidays feed) can't hold appointments.
export async function listWritableCalendars(accessToken: string): Promise<GoogleCalendarSummary[]> {
  const url = new URL(`${GOOGLE_CALENDAR_API_BASE_URL}/calendar/v3/users/me/calendarList`);
  url.searchParams.set("minAccessRole", "writer");
  url.searchParams.set("maxResults", "250");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google calendarList failed: ${await res.text()}`);

  const body = (await res.json()) as {
    items?: { id?: string; summary?: string; summaryOverride?: string; primary?: boolean }[];
  };
  return (body.items ?? [])
    .filter((item): item is { id: string; summary?: string; summaryOverride?: string; primary?: boolean } => !!item.id)
    .map((item) => ({
      id: item.id,
      name: item.summaryOverride ?? item.summary ?? item.id,
      primary: item.primary === true,
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

export async function createCalendar(
  accessToken: string,
  summary: string,
  timeZone: string,
): Promise<GoogleCalendarSummary> {
  const res = await fetch(`${GOOGLE_CALENDAR_API_BASE_URL}/calendar/v3/calendars`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ summary, timeZone }),
  });
  if (!res.ok) throw new Error(`Google calendar creation failed: ${await res.text()}`);
  const body = (await res.json()) as { id?: string; summary?: string };
  if (!body.id) throw new Error("Google calendar creation returned no id");
  return { id: body.id, name: body.summary ?? summary, primary: false };
}
