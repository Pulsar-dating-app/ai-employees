import { describe, expect, it } from "vitest";
import {
  closedDatesForAll,
  effectiveHours,
  eligibleProfessionals,
  mergeSlotsAcrossProfessionals,
  orderForAutoAssignment,
  statusAtMinute,
  minutesOfDay,
  type HoursRow,
} from "@/lib/professionals/rules";

// 2026-09-28 -- is a professional booked at one moment, and from when are
// they free again (minutes of the day on the business's clock).
describe("statusAtMinute", () => {
  const windows = [[minutesOfDay("09:00"), minutesOfDay("12:00")], [minutesOfDay("14:00"), minutesOfDay("18:00")]] as const;
  const at = (time: string) => minutesOfDay(time);

  it("is free inside working hours with nothing booked", () => {
    expect(statusAtMinute({ at: at("10:00"), windows, busy: [], timeOff: false })).toEqual({ free: true });
  });

  it("follows back-to-back bookings to the first gap", () => {
    const busy = [
      [at("10:00"), at("10:30")],
      [at("10:30"), at("11:15")],
    ] as const;
    expect(statusAtMinute({ at: at("10:00"), windows, busy, timeOff: false })).toEqual({
      free: false,
      reason: "busy",
      freeFrom: at("11:15"),
    });
    // Mid-booking counts as busy too.
    expect(statusAtMinute({ at: at("10:45"), windows, busy, timeOff: false })).toMatchObject({ reason: "busy" });
    // A booking ending exactly at the asked time doesn't block it.
    expect(statusAtMinute({ at: at("11:15"), windows, busy, timeOff: false })).toEqual({ free: true });
  });

  it("has no freeFrom when the rest of that working window is booked", () => {
    const busy = [[at("11:00"), at("12:00")]] as const;
    expect(statusAtMinute({ at: at("11:00"), windows, busy, timeOff: false })).toEqual({
      free: false,
      reason: "busy",
      freeFrom: null,
    });
  });

  it("is not_working outside every window, and time_off wins over everything", () => {
    expect(statusAtMinute({ at: at("13:00"), windows, busy: [], timeOff: false })).toEqual({
      free: false,
      reason: "not_working",
    });
    expect(statusAtMinute({ at: at("12:00"), windows, busy: [], timeOff: false })).toMatchObject({ reason: "not_working" });
    expect(statusAtMinute({ at: at("10:00"), windows, busy: [], timeOff: true })).toEqual({
      free: false,
      reason: "time_off",
    });
  });
});

// 2026-09-24 -- the pure rules behind one schedule per professional.
const ESTABLISHMENT: HoursRow[] = [
  { day_of_week: 1, start_time: "09:00", end_time: "18:00", professional_id: null },
  { day_of_week: 2, start_time: "09:00", end_time: "18:00", professional_id: null },
];
const OWN: HoursRow[] = [{ day_of_week: 6, start_time: "08:00", end_time: "12:00", professional_id: "p2" }];

describe("effectiveHours", () => {
  it("follows the establishment's hours by default", () => {
    expect(effectiveHours({ id: "p1", usesCustomHours: false }, [...ESTABLISHMENT, ...OWN])).toEqual([
      { day_of_week: 1, start_time: "09:00", end_time: "18:00" },
      { day_of_week: 2, start_time: "09:00", end_time: "18:00" },
    ]);
  });

  it("uses only the professional's own rows once they have their own schedule", () => {
    expect(effectiveHours({ id: "p2", usesCustomHours: true }, [...ESTABLISHMENT, ...OWN])).toEqual([
      { day_of_week: 6, start_time: "08:00", end_time: "12:00" },
    ]);
  });

  it("a custom schedule with no rows means not working any day, not 'inherit'", () => {
    expect(effectiveHours({ id: "p3", usesCustomHours: true }, [...ESTABLISHMENT, ...OWN])).toEqual([]);
  });
});

describe("eligibleProfessionals", () => {
  const active = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("everyone performs a service nobody is linked to", () => {
    expect(eligibleProfessionals(active, [])).toEqual(active);
  });

  it("only the linked professionals perform a restricted service", () => {
    expect(eligibleProfessionals(active, ["b", "c"])).toEqual([{ id: "b" }, { id: "c" }]);
  });

  it("a service linked only to an inactive professional is performed by no one", () => {
    expect(eligibleProfessionals(active, ["gone"])).toEqual([]);
  });
});

describe("mergeSlotsAcrossProfessionals", () => {
  it("merges by start time, naming everyone free then, sorted", () => {
    const merged = mergeSlotsAcrossProfessionals([
      {
        professional: { id: "a", name: "Ana" },
        slots: [
          { start: "2027-03-01T10:00:00.000Z", end: "2027-03-01T10:30:00.000Z" },
          { start: "2027-03-01T09:00:00.000Z", end: "2027-03-01T09:30:00.000Z" },
        ],
      },
      {
        professional: { id: "b", name: "Bruno" },
        slots: [{ start: "2027-03-01T10:00:00.000Z", end: "2027-03-01T10:30:00.000Z" }],
      },
    ]);
    expect(merged).toEqual([
      { start: "2027-03-01T09:00:00.000Z", end: "2027-03-01T09:30:00.000Z", professionals: [{ id: "a", name: "Ana" }] },
      {
        start: "2027-03-01T10:00:00.000Z",
        end: "2027-03-01T10:30:00.000Z",
        professionals: [
          { id: "a", name: "Ana" },
          { id: "b", name: "Bruno" },
        ],
      },
    ]);
  });
});

describe("closedDatesForAll", () => {
  // 2027-03-01 is a Monday, 03-06 a Saturday, 03-07 a Sunday.
  const dates = ["2027-03-01", "2027-03-06", "2027-03-07"];

  it("a day is closed only when no professional works it", () => {
    expect(closedDatesForAll(dates, [new Set([1]), new Set([6])])).toEqual(["2027-03-07"]);
  });

  it("with nobody considered, every day is closed", () => {
    expect(closedDatesForAll(dates, [])).toEqual(dates);
  });
});

describe("orderForAutoAssignment", () => {
  it("prefers whoever has fewer bookings that day, then the merchant's order", () => {
    const candidates = [
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ];
    const counts = new Map([
      ["a", 2],
      ["b", 0],
    ]);
    expect(orderForAutoAssignment(candidates, counts).map((p) => p.id)).toEqual(["b", "c", "a"]);
  });
});
