import { describe, expect, it } from "vitest";
import { calendarVisibleEndsAt } from "@/lib/google-calendar/appointment-sync";

// The Google Calendar event for an appointment is deliberately shorter than
// appointments.ends_at (which includes the service's buffer minutes) -- see
// the 2026-09-04 decisions.md entry. This is the one pure piece of that
// change; the rest is wiring at each call site, exercised indirectly by the
// scheduling-tools/appointments integration suites (no Google connection in
// any of them, so the sync itself always degrades to a no-op there).
describe("calendarVisibleEndsAt", () => {
  it("adds only the service duration, excluding any buffer", () => {
    expect(calendarVisibleEndsAt("2027-03-01T09:00:00Z", 60)).toBe(
      "2027-03-01T10:00:00.000Z",
    );
  });

  it("is a no-op for a zero-duration input", () => {
    expect(calendarVisibleEndsAt("2027-03-01T09:00:00Z", 0)).toBe(
      "2027-03-01T09:00:00.000Z",
    );
  });

  it("carries a non-UTC offset input through as an equivalent UTC instant", () => {
    expect(calendarVisibleEndsAt("2027-03-01T09:00:00-03:00", 30)).toBe(
      "2027-03-01T12:30:00.000Z",
    );
  });
});
