import { getValidAccessToken } from "./connection";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "./events";

// Trello I3 -- the three operations the appointments routes call to keep a
// confirmed appointment's Google Calendar event in sync. Each is
// best-effort and never throws: no connected calendar, an unrefreshable
// token, or the Google API call itself failing all degrade silently
// (logged via console.error) rather than blocking the appointment write
// that triggered them -- the DB row is the source of truth, this is a
// layer on top. See the 2026-08-29 decisions.md entry.

export type AppointmentSyncDetails = {
  serviceName: string;
  customerName: string;
  startsAt: string;
  endsAt: string;
};

// Called the moment an appointment becomes `confirmed` (at creation for an
// auto-confirming company, or via a later PATCH for one requiring manual
// approval) -- never for a merely `requested` appointment. Returns the new
// google_event_id, or null if it couldn't sync.
export async function syncAppointmentConfirmed(
  companyId: string,
  details: AppointmentSyncDetails,
): Promise<string | null> {
  const connection = await getValidAccessToken(companyId);
  if (!connection) return null;

  try {
    const event = await createCalendarEvent(connection.accessToken, connection.calendarId, {
      summary: `${details.serviceName} — ${details.customerName}`,
      startIso: details.startsAt,
      endIso: details.endsAt,
    });
    return event.id;
  } catch (err) {
    console.error("Failed to create Google Calendar event for appointment", err);
    return null;
  }
}

// Called when a synced appointment's starts_at/service_id changes. Only
// updates start/end -- the summary is left as-is (see decisions.md: the
// service essentially never changes on a reschedule, and updating it would
// need a customer-name refetch this path doesn't otherwise need).
export async function syncAppointmentRescheduled(
  companyId: string,
  googleEventId: string,
  details: { startsAt: string; endsAt: string },
): Promise<void> {
  const connection = await getValidAccessToken(companyId);
  if (!connection) return;

  try {
    await updateCalendarEvent(connection.accessToken, connection.calendarId, googleEventId, {
      startIso: details.startsAt,
      endIso: details.endsAt,
    });
  } catch (err) {
    console.error("Failed to update Google Calendar event for rescheduled appointment", err);
  }
}

// Called when a synced appointment's status becomes `cancelled`.
export async function syncAppointmentCancelled(companyId: string, googleEventId: string): Promise<void> {
  const connection = await getValidAccessToken(companyId);
  if (!connection) return;

  try {
    await deleteCalendarEvent(connection.accessToken, connection.calendarId, googleEventId);
  } catch (err) {
    console.error("Failed to delete Google Calendar event for cancelled appointment", err);
  }
}
