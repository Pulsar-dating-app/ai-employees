export function localDateOf(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function minutesOfDay(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function clock(instant: Date, timezone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(instant);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayHeading(
  date: string,
  today: string,
  locale: string,
  labels: { today: string; tomorrow: string },
): { primary: string; secondary: string } {
  const noon = new Date(`${date}T12:00:00Z`);
  const long = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(noon);
  if (date === today) return { primary: labels.today, secondary: long };
  if (date === shiftDate(today, 1)) return { primary: labels.tomorrow, secondary: long };
  const weekday = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "long" }).format(noon);
  const rest = new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "numeric", month: "long" }).format(noon);
  return { primary: weekday, secondary: rest };
}

export function relativeFromNow(target: Date, locale: string, now: number): string {
  const minutes = Math.round((target.getTime() - now) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export function hourLabel(minutes: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", hour: "numeric" }).format(
    new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60))),
  );
}
