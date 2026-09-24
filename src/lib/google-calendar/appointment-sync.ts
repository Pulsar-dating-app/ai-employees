import { getValidAccessToken } from "./connection";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "./events";

// Trello I3 -- the three operations the appointments write paths call to
// keep a confirmed appointment's Google Calendar event in sync. Each is
// best-effort and never throws: no connected calendar, an unrefreshable
// token, or the Google API call itself failing all degrade silently
// (logged via console.error) rather than blocking the appointment write
// that triggered them -- the DB row is the source of truth, this is a
// layer on top. See the 2026-08-29 decisions.md entry.
//
// 2026-09-24 -- per professional: events go to the calendar connected for
// the appointment's professional. The calendar an event was created in is
// returned and stored on the appointment (appointments.google_calendar_id),
// and passed back on reschedule/cancel, so a professional who later picks a
// different calendar doesn't orphan events in the old one.

// The calendar event is deliberately shorter than appointments.ends_at.
// `ends_at` = starts_at + duration + buffer, and that full span is what
// actually keeps the slot from being double-booked (the exclusion
// constraint and the availability engine both key off it, independent of
// what's on Google) -- but showing the buffer as part of the visible event
// would make the merchant's calendar look padded with dead time attached to
// every appointment. So the event itself spans only the service's own
// duration; the buffer stays a real block, just an invisible one. See the
// 2026-09-04 decisions.md entry.
export function calendarVisibleEndsAt(startsAt: string, durationMinutes: number): string {
  return new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString();
}

export function toCalendarIso(value: string): string {
  return new Date(value).toISOString();
}

export type AppointmentSyncDetails = {
  serviceName: string;
  customerName: string;
  startsAt: string;
  // The event's end time as it should appear on the calendar -- callers
  // pass calendarVisibleEndsAt(startsAt, service.duration_minutes), never
  // appointments.ends_at directly (that includes the buffer).
  visibleEndsAt: string;
  // Trello -- Ana's professional-facing recap of the booking, stored on the
  // appointment and mirrored into the calendar event description. Optional.
  summary?: string | null;
};

export type SyncedEvent = { googleEventId: string; googleCalendarId: string };

// Called the moment an appointment becomes `confirmed` (at creation for an
// auto-confirming company, or via a later PATCH for one requiring manual
// approval) -- never for a merely `requested` appointment. Returns the new
// event id plus the calendar it lives in, or null if it couldn't sync.
export async function syncAppointmentConfirmed(
  professionalId: string,
  details: AppointmentSyncDetails,
): Promise<SyncedEvent | null> {
  const connection = await getValidAccessToken(professionalId);
  if (!connection) return null;

  try {
    const summary = details.customerName
      ? `${details.serviceName} — ${details.customerName}`
      : details.serviceName;
    const event = await createCalendarEvent(connection.accessToken, connection.calendarId, {
      summary,
      description: details.summary ?? null,
      startIso: toCalendarIso(details.startsAt),
      endIso: toCalendarIso(details.visibleEndsAt),
    });
    return { googleEventId: event.id, googleCalendarId: connection.calendarId };
  } catch (err) {
    console.error("Failed to create Google Calendar event for appointment", err);
    return null;
  }
}

// Called when a synced appointment's starts_at/service_id changes. Only
// updates start/end -- the summary is left as-is (see decisions.md: the
// service essentially never changes on a reschedule, and updating it would
// need a customer-name refetch this path doesn't otherwise need).
// `googleCalendarId` is the calendar the event was created in (null for rows
// synced before 2026-09-24 -> the professional's current calendar).
export async function syncAppointmentRescheduled(
  professionalId: string,
  googleEventId: string,
  googleCalendarId: string | null,
  details: { startsAt: string; visibleEndsAt: string },
): Promise<void> {
  const connection = await getValidAccessToken(professionalId);
  if (!connection) return;

  try {
    await updateCalendarEvent(connection.accessToken, googleCalendarId ?? connection.calendarId, googleEventId, {
      startIso: toCalendarIso(details.startsAt),
      endIso: toCalendarIso(details.visibleEndsAt),
    });
  } catch (err) {
    console.error("Failed to update Google Calendar event for rescheduled appointment", err);
  }
}

// Called when a synced appointment's status becomes `cancelled` -- and when
// an appointment moves to another professional (the event leaves the old
// professional's calendar, and a new one is created in the new one's).
export async function syncAppointmentCancelled(
  professionalId: string,
  googleEventId: string,
  googleCalendarId: string | null,
): Promise<void> {
  const connection = await getValidAccessToken(professionalId);
  if (!connection) return;

  try {
    await deleteCalendarEvent(connection.accessToken, googleCalendarId ?? connection.calendarId, googleEventId);
  } catch (err) {
    console.error("Failed to delete Google Calendar event for cancelled appointment", err);
  }
}
