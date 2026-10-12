// 2026-10-12 -- Google's OAuth verification requires the scopes the app
// requests to string-match the ones registered on the Cloud Console consent
// screen, and to be the narrowest that cover each feature. One per Calendar
// API call we make:
// - events.owned: create/update/delete appointment events (events.ts), on
//   calendars the account owns -- hence listWritableCalendars asks for
//   minAccessRole=owner.
// - freebusy: freeBusy.query for availability (freebusy.ts) -- busy
//   intervals only, never event details.
// - calendarlist.readonly: the calendar picker (calendars.ts).
// - app.created: "Create a calendar just for this" (calendars.ts).
// Changing this list means changing the Cloud Console consent screen too.
// Imported by the browser (the connect button) and the connect route.
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.app.created",
] as const;

// Connections made before 2026-10-12 hold this broad scope, which covers
// every call above.
const LEGACY_FULL_SCOPE = "https://www.googleapis.com/auth/calendar";

// Google's consent screen lets the user untick individual scopes, and the
// token response's space-separated `scope` says what was actually granted.
export function missingCalendarScopes(granted: string | null): string[] {
  const grantedSet = new Set((granted ?? "").split(" ").filter(Boolean));
  if (grantedSet.has(LEGACY_FULL_SCOPE)) return [];
  return GOOGLE_CALENDAR_SCOPES.filter((scope) => !grantedSet.has(scope));
}
