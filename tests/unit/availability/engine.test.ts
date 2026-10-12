import { describe, expect, it } from "vitest";
import { computeAvailableSlots, isWithinBusinessHours, type BusinessHourWindow } from "@/lib/availability/engine";

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

  it("steps a quarter-hour grid whatever the service length, with the returned end excluding the buffer", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31",
      to: "2026-08-31",
      durationMinutes: 30,
      bufferMinutes: 5,
      businessHours: [MON_9_TO_12],
      busy: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });

    // 09:00-12:00 every 15 min (not every 30+5, which skipped 10:00); the
    // last start is 11:30, since 11:45+30 would run past closing.
    expect(slots.map((s) => s.start)).toEqual([
      "2026-08-31T09:00:00.000Z",
      "2026-08-31T09:15:00.000Z",
      "2026-08-31T09:30:00.000Z",
      "2026-08-31T09:45:00.000Z",
      "2026-08-31T10:00:00.000Z",
      "2026-08-31T10:15:00.000Z",
      "2026-08-31T10:30:00.000Z",
      "2026-08-31T10:45:00.000Z",
      "2026-08-31T11:00:00.000Z",
      "2026-08-31T11:15:00.000Z",
      "2026-08-31T11:30:00.000Z",
    ]);
    expect(slots[0].end).toBe("2026-08-31T09:30:00.000Z"); // duration only, no buffer
  });

  it("starts on the next quarter hour when opening time isn't on one", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31",
      to: "2026-08-31",
      durationMinutes: 30,
      bufferMinutes: 0,
      businessHours: [{ day_of_week: 1, start_time: "09:10", end_time: "10:00" }],
      busy: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(slots.map((s) => s.start)).toEqual(["2026-08-31T09:15:00.000Z", "2026-08-31T09:30:00.000Z"]);
  });

  it("offers a slot whose trailing buffer spills past closing time, as long as the visible appointment fits", () => {
    // 09:00-10:00 window, 45min duration + 30min buffer: 09:00 and 09:15
    // fit (the visible part ends by 10:00, the buffer runs past it); 09:30
    // would end at 10:15, past closing.
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
    expect(slots).toEqual([
      { start: "2026-08-31T09:00:00.000Z", end: "2026-08-31T09:45:00.000Z" },
      { start: "2026-08-31T09:15:00.000Z", end: "2026-08-31T10:00:00.000Z" },
    ]);
  });

  it("blocks exactly the reserved (buffer-inclusive) interval of an existing appointment", () => {
    // 09:00-12:00, 30min duration + 15min buffer. An appointment reserving
    // 09:45-10:30 (its own 30+15) blocks every start whose 30+15 reservation
    // overlaps it -- 09:15 (until 10:00) through 10:15 -- and nothing else:
    // 09:00 ends its reservation exactly at 09:45, 10:30 starts exactly at
    // the appointment's end.
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
      "2026-08-31T10:45:00.000Z",
      "2026-08-31T11:00:00.000Z",
      "2026-08-31T11:15:00.000Z",
      "2026-08-31T11:30:00.000Z",
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

  it("offers the quarter hour right after another service's booking ends, leaving no gap", () => {
    // A 40+5 min booking at 09:00 holds the chair until 09:45; a 30+5 min
    // service is offered from exactly 09:45 (the old per-service grid of
    // 09:00/09:35/10:10 would have left 09:45-10:10 empty).
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31",
      to: "2026-08-31",
      durationMinutes: 30,
      bufferMinutes: 5,
      businessHours: [{ day_of_week: 1, start_time: "09:00", end_time: "11:00" }],
      busy: [{ start: "2026-08-31T09:00:00.000Z", end: "2026-08-31T09:45:00.000Z" }],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(slots[0].start).toBe("2026-08-31T09:45:00.000Z");
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

  it("(J7) excludes slots inside the minimum booking lead time", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      from: "2026-08-31",
      to: "2026-08-31",
      durationMinutes: 30,
      bufferMinutes: 0,
      businessHours: [MON_9_TO_12],
      busy: [],
      // 09:00 open, now is 08:00, but a 120-minute lead time pushes the
      // earliest bookable start to 10:00.
      minLeadTimeMinutes: 120,
      now: new Date("2026-08-31T08:00:00.000Z"),
    });
    expect(slots.map((s) => s.start)).not.toContain("2026-08-31T09:00:00.000Z");
    expect(slots.map((s) => s.start)).not.toContain("2026-08-31T09:30:00.000Z");
    expect(slots.map((s) => s.start)).toContain("2026-08-31T10:30:00.000Z");
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
      "2026-08-31T12:15:00.000Z",
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

// Trello H3 gap fix -- the appointments write path (POST/PATCH) now rejects
// a booking outside business hours instead of only advising via
// computeAvailableSlots. See the 2026-08-29 decisions.md entry.
describe("isWithinBusinessHours", () => {
  it("accepts a start time that fits inside a window", () => {
    expect(
      isWithinBusinessHours({
        timezone: "UTC",
        businessHours: [MON_9_TO_12],
        startsAt: "2026-08-31T10:00:00.000Z", // Monday
        durationMinutes: 30,
      }),
    ).toBe(true);
  });

  it("rejects a start time before the window opens", () => {
    expect(
      isWithinBusinessHours({
        timezone: "UTC",
        businessHours: [MON_9_TO_12],
        startsAt: "2026-08-31T08:00:00.000Z",
        durationMinutes: 30,
      }),
    ).toBe(false);
  });

  it("rejects a start time whose duration would run past closing, even if the start itself is inside the window", () => {
    expect(
      isWithinBusinessHours({
        timezone: "UTC",
        businessHours: [MON_9_TO_12],
        startsAt: "2026-08-31T11:45:00.000Z", // window closes 12:00
        durationMinutes: 30, // would end 12:15
      }),
    ).toBe(false);
  });

  it("rejects a day with no matching business_hours row at all", () => {
    expect(
      isWithinBusinessHours({
        timezone: "UTC",
        businessHours: [MON_9_TO_12],
        startsAt: "2026-09-01T10:00:00.000Z", // Tuesday
        durationMinutes: 30,
      }),
    ).toBe(false);
  });

  it("does not require alignment to the slot-step grid -- any start with room for the full duration passes", () => {
    // 09:00-12:00 window; 09:07 isn't a multiple of any duration+buffer
    // step computeAvailableSlots would have walked, but the business is
    // genuinely open and there's room for the appointment, so it passes.
    expect(
      isWithinBusinessHours({
        timezone: "UTC",
        businessHours: [MON_9_TO_12],
        startsAt: "2026-08-31T09:07:00.000Z",
        durationMinutes: 30,
      }),
    ).toBe(true);
  });

  it("resolves against the correct local day in a non-UTC timezone", () => {
    // America/Sao_Paulo is UTC-3: 2026-08-31T09:00 local is 12:00 UTC.
    expect(
      isWithinBusinessHours({
        timezone: "America/Sao_Paulo",
        businessHours: [{ day_of_week: 1, start_time: "09:00", end_time: "10:00" }],
        startsAt: "2026-08-31T12:30:00.000Z",
        durationMinutes: 15,
      }),
    ).toBe(true);
    expect(
      isWithinBusinessHours({
        timezone: "America/Sao_Paulo",
        businessHours: [{ day_of_week: 1, start_time: "09:00", end_time: "10:00" }],
        startsAt: "2026-08-31T09:30:00.000Z", // 06:30 local -- before the window
        durationMinutes: 15,
      }),
    ).toBe(false);
  });

  it("rejects an invalid startsAt string rather than throwing", () => {
    expect(
      isWithinBusinessHours({
        timezone: "UTC",
        businessHours: [MON_9_TO_12],
        startsAt: "not-a-date",
        durationMinutes: 30,
      }),
    ).toBe(false);
  });
});
