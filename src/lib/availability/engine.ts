// Trello I2 -- the pure slot-computation core behind the availability
// engine. Kept out of the IO layer (load.ts) so the chunking/overlap logic
// is unit-testable without a DB or HTTP, matching how E2 (analytics) splits
// aggregate.ts (pure) from load.ts (the DB side).
//
// day_of_week convention: 0 = Sunday, matching Date.getUTCDay()/Postgres's
// EXTRACT(dow FROM ...) -- H2's own migration never pinned this down
// explicitly, so this is the first place it's made concrete. See
// architecture.md's H2/I2 sections.

export type BusinessHourWindow = {
  day_of_week: number; // 0 = Sunday .. 6 = Saturday
  start_time: string; // "HH:MM" or "HH:MM:SS", local wall-clock time
  end_time: string;
};

// ISO UTC instants.
export type BusyInterval = { start: string; end: string };
export type AvailableSlot = { start: string; end: string };

export type ComputeAvailableSlotsInput = {
  timezone: string;
  from: string; // "YYYY-MM-DD", inclusive
  to: string; // "YYYY-MM-DD", inclusive
  durationMinutes: number;
  bufferMinutes: number;
  // Pre-filtered to is_active by the caller (load.ts) -- this function
  // doesn't know about that column.
  businessHours: readonly BusinessHourWindow[];
  // appointments + Google freebusy, already merged into one list by the
  // caller -- this function doesn't care where an interval came from, only
  // that it's occupied.
  busy: readonly BusyInterval[];
  // Injectable for deterministic tests; defaults to the real current time.
  now?: Date;
};

// Plain calendar arithmetic on a date-only string via UTC accessors, so no
// timezone is ever accidentally re-introduced -- mirrors
// src/lib/analytics/load.ts's addDays (not imported directly: that module
// is IO-adjacent and this stays a standalone pure module with zero
// cross-imports).
function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

// tz's UTC offset (ms, tz-time minus utc-time) at the instant `utcGuess`.
// Built via formatToParts (not a locale short-date string) for the same
// reason analytics/load.ts's localDate does -- stays ISO-shaped regardless
// of which locale data the Node build ships.
function tzOffsetMsAt(tz: string, utcGuess: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utcGuess);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    pick("hour"),
    pick("minute"),
    pick("second"),
  );
  return asUtc - utcGuess.getTime();
}

// Local wall-clock date + time in `tz` -> the real UTC instant it
// represents. Standard two-pass offset-resolution technique: format a UTC
// guess in the target zone to measure the offset, correct once, then
// re-measure at the corrected instant to catch a DST-transition edge case
// where the offset itself changed between the guess and the answer.
function zonedTimeToUtc(dateOnly: string, timeOnly: string, tz: string): Date {
  const guess = new Date(`${dateOnly}T${timeOnly.length === 5 ? `${timeOnly}:00` : timeOnly}Z`);
  const offset1 = tzOffsetMsAt(tz, guess);
  const corrected = new Date(guess.getTime() - offset1);
  const offset2 = tzOffsetMsAt(tz, corrected);
  return new Date(guess.getTime() - offset2);
}

// tz's local day-of-week (0 = Sunday) for the given date-only string, at
// local noon -- avoids any midnight-boundary ambiguity from the offset
// calculation above; a date-only string has no "time" of its own to be
// wrong about.
function localDayOfWeek(dateOnly: string, tz: string): number {
  const noonUtc = zonedTimeToUtc(dateOnly, "12:00", tz);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).formatToParts(
    noonUtc,
  );
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return index === -1 ? new Date(noonUtc).getUTCDay() : index;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// UTC instant -> the "YYYY-MM-DD" calendar date it falls on in `tz`. Same
// formatToParts technique as tzOffsetMsAt above (and analytics/load.ts's
// localDate, for the same instant->local-date problem) -- not imported from
// there, this module stays cross-import-free by design (see the file header).
function localDateOf(tz: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export type BusinessHoursCheckInput = {
  timezone: string;
  // Pre-filtered to is_active by the caller, same convention as
  // computeAvailableSlots.
  businessHours: readonly BusinessHourWindow[];
  startsAt: string; // ISO UTC
  durationMinutes: number;
};

// Trello H3 gap, closed here rather than duplicated: the appointments write
// path (POST/PATCH) needs to reject a booking whose requested time falls
// outside every active business_hours window for that local day -- I2's
// availability engine only ever offered slots as advisory reads, nothing
// enforced them at write time. Mirrors computeAvailableSlots' own window-fit
// rule (`start >= windowStart && start + duration <= windowEnd`) exactly, so
// a time this accepts is always one computeAvailableSlots would have
// offered as a valid window to book *something* in -- but deliberately does
// NOT require alignment to the step grid computeAvailableSlots walks (e.g. a
// 9:15 start inside a 9:00-17:00 window passes here even though
// computeAvailableSlots would only ever have offered 9:00/9:30/...): this
// check's job is "is the business open long enough for this," not "is this
// exactly one of the suggested slots" -- a merchant manually booking a
// custom time isn't required to land on the grid.
export function isWithinBusinessHours(input: BusinessHoursCheckInput): boolean {
  const { timezone, businessHours, startsAt, durationMinutes } = input;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return false;

  const startMs = start.getTime();
  const durationMs = durationMinutes * 60_000;
  const date = localDateOf(timezone, start);
  const dow = localDayOfWeek(date, timezone);

  return businessHours
    .filter((w) => w.day_of_week === dow)
    .some((window) => {
      const windowStart = zonedTimeToUtc(date, window.start_time, timezone).getTime();
      const windowEnd = zonedTimeToUtc(date, window.end_time, timezone).getTime();
      return startMs >= windowStart && startMs + durationMs <= windowEnd;
    });
}

export function computeAvailableSlots(input: ComputeAvailableSlotsInput): AvailableSlot[] {
  const {
    timezone,
    from,
    to,
    durationMinutes,
    bufferMinutes,
    businessHours,
    busy,
    now = new Date(),
  } = input;

  const stepMs = (durationMinutes + bufferMinutes) * 60_000;
  const durationMs = durationMinutes * 60_000;
  const nowMs = now.getTime();

  const busyMs = busy
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .sort((a, b) => a.start - b.start);

  const slots: AvailableSlot[] = [];

  for (const date of datesInRange(from, to)) {
    const dow = localDayOfWeek(date, timezone);
    const windows = businessHours.filter((w) => w.day_of_week === dow);

    for (const window of windows) {
      const windowStart = zonedTimeToUtc(date, window.start_time, timezone).getTime();
      const windowEnd = zonedTimeToUtc(date, window.end_time, timezone).getTime();

      for (let start = windowStart; start + durationMs <= windowEnd; start += stepMs) {
        if (start <= nowMs) continue;

        const reservedEnd = start + durationMs + bufferMinutes * 60_000;
        const blocked = busyMs.some((b) => overlaps(start, reservedEnd, b.start, b.end));
        if (blocked) continue;

        slots.push({ start: new Date(start).toISOString(), end: new Date(start + durationMs).toISOString() });
      }
    }
  }

  return slots;
}
