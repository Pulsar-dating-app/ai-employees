import { getTestEnv } from "./env";
import type { CapturedCalendarEvent } from "./google-calendar-mock";

// Reads / clears the events captured by the mock Google Calendar server that
// global-setup.ts started (its URL is in .test-env.json). The spawned
// next-dev process POSTs/PATCHes to the mock; tests read back through here.
// Same shape as helpers/email.ts's sentEmails/clearEmails.

export async function capturedCalendarEvents(): Promise<CapturedCalendarEvent[]> {
  const res = await fetch(`${getTestEnv().googleCalendarMockUrl}/__events`);
  return (await res.json()) as CapturedCalendarEvent[];
}

export async function clearCapturedCalendarEvents(): Promise<void> {
  await fetch(`${getTestEnv().googleCalendarMockUrl}/__events`, { method: "DELETE" });
}

export async function capturedCalendarEvent(
  eventId: string,
): Promise<CapturedCalendarEvent | undefined> {
  return (await capturedCalendarEvents()).find((e) => e.id === eventId);
}
