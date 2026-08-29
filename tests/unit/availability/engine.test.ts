import { describe, expect, it } from "vitest";
import { computeAvailableSlots, type BusinessHourWindow } from "@/lib/availability/engine";

// Trello I2 -- the real correctness coverage for the availability engine,
// no DB/HTTP needed (mirrors tests/unit/analytics/aggregate.test.ts's
// style). All fixtures use UTC as the business's timezone unless a test is
// specifically about timezone conversion, to keep expected UTC instants
// readable at a glance.

const MON_9_TO_12: BusinessHourWindow = { day_of_week: 1, start_time: "09:00", end_time: "12:00" };

describe("computeAvailableSlots", () => {
  it("returns nothing when there are no business hours", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31", // a Monday
      to: "2026-08-31",
      durationMinutes: 30,
      bufferMinutes: 0,
      businessHours: [],
      busy: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(slots).toEqual([]);
  });

  it("chunks a window by duration + buffer, with the returned end excluding the buffer", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31",
      to: "2026-08-31",
      durationMinutes: 30,
      bufferMinutes: 15,
      businessHours: [MON_9_TO_12],
      busy: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });

    // 09:00-12:00 stepped by 45min (30+15) -> 09:00, 09:45, 10:30, 11:15.
    // 12:00 itself isn't a valid start since 12:00+30 would exceed the
    // window's end... wait: last candidate is 11:15, next would be 12:00,
    // and 12:00+30=12:30 > windowEnd(12:00), so it's excluded correctly.
    expect(slots.map((s) => s.start)).toEqual([
      "2026-08-31T09:00:00.000Z",
      "2026-08-31T09:45:00.000Z",
      "2026-08-31T10:30:00.000Z",
      "2026-08-31T11:15:00.000Z",
    ]);
    expect(slots[0].end).toBe("2026-08-31T09:30:00.000Z"); // duration only, no buffer
  });

  it("offers a slot whose trailing buffer spills past closing time, as long as the visible appointment fits", () => {
    // 09:00-10:00 window, 45min duration + 30min buffer: 09:00 fits (ends
    // 09:45, well inside); next candidate would be 09:00+75min=10:15, but
    // 10:15+45=11:00 > windowEnd(10:00) so it's excluded. Only one slot.
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31",
      to: "2026-08-31",
      durationMinutes: 45,
      bufferMinutes: 30,
      businessHours: [{ day_of_week: 1, start_time: "09:00", end_time: "10:00" }],
      busy: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]).toEqual({ start: "2026-08-31T09:00:00.000Z", end: "2026-08-31T09:45:00.000Z" });
  });

  it("blocks exactly the reserved (buffer-inclusive) interval of an existing appointment", () => {
    // 09:00-12:00, 30min duration + 15min buffer -> candidates at 09:00,
    // 09:45, 10:30, 11:15. An appointment reserving 09:45-10:30 (its own
    // 30+15) should block only the 09:45 candidate.
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31",
      to: "2026-08-31",
      durationMinutes: 30,
      bufferMinutes: 15,
      businessHours: [MON_9_TO_12],
      busy: [{ start: "2026-08-31T09:45:00.000Z", end: "2026-08-31T10:30:00.000Z" }],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(slots.map((s) => s.start)).toEqual([
      "2026-08-31T09:00:00.000Z",
      "2026-08-31T10:30:00.000Z",
      "2026-08-31T11:15:00.000Z",
    ]);
  });

  it("blocks a slot overlapping a Google-busy interval the same way as an appointment", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31",
      to: "2026-08-31",
      durationMinutes: 30,
      bufferMinutes: 0,
      businessHours: [MON_9_TO_12],
      busy: [{ start: "2026-08-31T10:00:00.000Z", end: "2026-08-31T10:15:00.000Z" }],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(slots.map((s) => s.start)).not.toContain("2026-08-31T10:00:00.000Z");
    expect(slots.map((s) => s.start)).toContain("2026-08-31T09:00:00.000Z");
    expect(slots.map((s) => s.start)).toContain("2026-08-31T10:30:00.000Z");
  });

  it("packs adjacent bookings back-to-back with no gap when buffer is 0", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31",
      to: "2026-08-31",
      durationMinutes: 60,
      bufferMinutes: 0,
      businessHours: [{ day_of_week: 1, start_time: "09:00", end_time: "11:00" }],
      busy: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(slots.map((s) => s.start)).toEqual([
      "2026-08-31T09:00:00.000Z",
      "2026-08-31T10:00:00.000Z",
    ]);
  });

  it("excludes past slots relative to the injected now", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31",
      to: "2026-08-31",
      durationMinutes: 30,
      bufferMinutes: 0,
      businessHours: [MON_9_TO_12],
      busy: [],
      now: new Date("2026-08-31T10:00:00.000Z"),
    });
    for (const slot of slots) {
      expect(new Date(slot.start).getTime()).toBeGreaterThan(new Date("2026-08-31T10:00:00.000Z").getTime());
    }
    expect(slots.map((s) => s.start)).not.toContain("2026-08-31T09:00:00.000Z");
    expect(slots.map((s) => s.start)).not.toContain("2026-08-31T10:00:00.000Z");
  });

  it("resolves day-of-week and local business hours correctly in a non-UTC timezone", () => {
    // America/Sao_Paulo is UTC-3. A 09:00-10:00 local window on Monday
    // 2026-08-31 is 12:00-13:00 UTC.
    const slots = computeAvailableSlots({
      timezone: "America/Sao_Paulo",
      from: "2026-08-31",
      to: "2026-08-31",
      durationMinutes: 30,
      bufferMinutes: 0,
      businessHours: [{ day_of_week: 1, start_time: "09:00", end_time: "10:00" }],
      busy: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(slots.map((s) => s.start)).toEqual([
      "2026-08-31T12:00:00.000Z",
      "2026-08-31T12:30:00.000Z",
    ]);
  });

  it("resolves local day-of-week correctly near a UTC date boundary", () => {
    // 2026-08-31 is a Monday everywhere in the world by local wall clock,
    // but late evening UTC on 2026-08-30 (a Sunday) is already Monday in a
    // far-ahead timezone. A Sunday-only business_hours window should not
    // leak into what computeAvailableSlots treats as Monday 2026-08-31 in
    // Pacific/Auckland (UTC+12/+13), and vice versa -- this asserts the
    // day-of-week resolution is anchored to the *date string* interpreted
    // in the target zone, not to some incidental UTC weekday.
    const sundayOnly: BusinessHourWindow = { day_of_week: 0, start_time: "09:00", end_time: "10:00" };
    const slots = computeAvailableSlots({
      timezone: "Pacific/Auckland",
      from: "2026-08-31", // Monday in Auckland
      to: "2026-08-31",
      durationMinutes: 30,
      bufferMinutes: 0,
      businessHours: [sundayOnly],
      busy: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(slots).toEqual([]);
  });

  it("spans multiple days in the requested range", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31", // Monday
      to: "2026-09-01", // Tuesday, no matching business_hours
      durationMinutes: 60,
      bufferMinutes: 0,
      businessHours: [MON_9_TO_12],
      busy: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(slots.every((s) => s.start.startsWith("2026-08-31"))).toBe(true);
    expect(slots.length).toBeGreaterThan(0);
  });
});
