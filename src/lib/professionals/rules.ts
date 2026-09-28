import type { AvailableSlot, BusinessHourWindow } from "@/lib/availability/engine";

// 2026-09-24 -- the pure rules behind multiple schedules per company (one per
// professional). Kept free of IO so they're unit-testable; repository.ts and
// availability/load.ts do the reading. See decisions.md "Multiple schedules
// per company".

export type ProfessionalRef = { id: string; name: string };

export type HoursRow = BusinessHourWindow & { professional_id: string | null };

// A professional follows the establishment's hours (business_hours rows with
// professional_id NULL) unless they have their own schedule, in which case
// only their own rows count -- possibly none, meaning they don't work any
// day. The flag, not the presence of rows, decides: "custom with no days"
// and "inherits" must stay distinguishable.
export function effectiveHours(
  professional: { id: string; usesCustomHours: boolean },
  rows: readonly HoursRow[],
): BusinessHourWindow[] {
  return rows
    .filter((row) =>
      professional.usesCustomHours ? row.professional_id === professional.id : row.professional_id === null,
    )
    .map(({ day_of_week, start_time, end_time }) => ({ day_of_week, start_time, end_time }));
}

// Who can perform a service: the professionals explicitly linked to it
// (professional_services), or everyone when nobody is linked. `linkedIds`
// includes inactive professionals on purpose -- a service linked only to a
// deactivated professional is performed by no one, not suddenly by all.
export function eligibleProfessionals<T extends { id: string }>(
  active: readonly T[],
  linkedIds: readonly string[],
): T[] {
  if (linkedIds.length === 0) return [...active];
  const linked = new Set(linkedIds);
  return active.filter((p) => linked.has(p.id));
}

export type MergedSlot = AvailableSlot & { professionals: ProfessionalRef[] };

// "Any professional" availability: one entry per distinct start time, naming
// every professional free at that time, in the order they were given (the
// caller passes them by `position`). Sorted by start.
export function mergeSlotsAcrossProfessionals(
  perProfessional: readonly { professional: ProfessionalRef; slots: readonly AvailableSlot[] }[],
): MergedSlot[] {
  const byStart = new Map<string, MergedSlot>();
  for (const { professional, slots } of perProfessional) {
    for (const slot of slots) {
      const existing = byStart.get(slot.start);
      if (existing) {
        existing.professionals.push(professional);
        // Services have one duration, so `end` is the same for everyone;
        // keep the longest just in case.
        if (slot.end > existing.end) existing.end = slot.end;
      } else {
        byStart.set(slot.start, { start: slot.start, end: slot.end, professionals: [professional] });
      }
    }
  }
  return [...byStart.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

// A date is "closed" (the business never works then) only when it's closed
// for every professional considered -- one barber off on Mondays doesn't
// make Monday a closed day for the shop.
export function closedDatesForAll(
  dates: readonly string[],
  openWeekdaysPerProfessional: readonly ReadonlySet<number>[],
): string[] {
  return dates.filter((date) => {
    // Parsed as UTC midnight purely to read the weekday off a plain date.
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    return openWeekdaysPerProfessional.every((open) => !open.has(dow));
  });
}

// Order in which to try professionals when the customer has no preference:
// fewest live bookings that local day first (spreads the work), then the
// merchant's own ordering.
export function orderForAutoAssignment<T extends { id: string; position: number }>(
  candidates: readonly T[],
  bookingsThatDay: ReadonlyMap<string, number>,
): T[] {
  return [...candidates].sort(
    (a, b) => (bookingsThatDay.get(a.id) ?? 0) - (bookingsThatDay.get(b.id) ?? 0) || a.position - b.position,
  );
}

// 2026-09-28 -- is a professional free at one moment of a day, and if not,
// from when? What Ana needs the moment a customer names a day, a time and a
// professional -- before the service is known, so no duration is involved:
// it says "someone is booked at 10:00", never "a 60-minute service fits".
// Minutes are minutes-of-day on the business's clock.
//   - `windows`: that weekday's working hours, [start, end) each.
//   - `busy`: that day's live bookings, [start, end) each (end includes the
//     booking's buffer), already clipped to the day.
// A time outside every window is "not_working"; time off wins over all.
// `freeFrom` follows back-to-back bookings to the first gap, and is null when
// the rest of that working window is booked.
export type StatusAt =
  | { free: true }
  | { free: false; reason: "time_off" | "not_working" }
  | { free: false; reason: "busy"; freeFrom: number | null };

export function statusAtMinute(input: {
  at: number;
  windows: readonly (readonly [number, number])[];
  busy: readonly (readonly [number, number])[];
  timeOff: boolean;
}): StatusAt {
  if (input.timeOff) return { free: false, reason: "time_off" };
  const window = input.windows.find(([start, end]) => input.at >= start && input.at < end);
  if (!window) return { free: false, reason: "not_working" };

  let t = input.at;
  for (;;) {
    const blocking = input.busy.find(([start, end]) => start <= t && t < end);
    if (!blocking) break;
    t = blocking[1];
  }
  if (t === input.at) return { free: true };
  return { free: false, reason: "busy", freeFrom: t < window[1] ? t : null };
}

// "HH:MM" or "HH:MM:SS" -> minutes of the day.
export function minutesOfDay(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
