import { isValidTimeZone } from "@/lib/analytics/load";

// A short, unambiguous wall-clock rendering of a UTC instant in the
// business's timezone -- e.g. "Wed, Sep 3, 14:40".
//
// The scheduling tools hand this to the agent as a ready-to-speak `label`
// alongside the raw ISO instant, so the model never has to convert a UTC
// timestamp to local time itself: it gets that arithmetic wrong (found in
// production 2026-09-02 -- Ana offered "9h, 9h40..." that were actually UTC,
// and told the customer the times were "horário UTC"). The model still
// phrases the label in the customer's language; translating "Wed"/"Sep" or
// switching 24h<->12h is something it does reliably, unlike timezone math.
//
// 24-hour clock and en-US month/weekday names deliberately: the primary
// market reads 24h, and English part names are the most reliable thing for
// the model to translate from. The raw ISO field stays in every result for
// anything that needs the real instant (e.g. book_appointment's slot arg).
export function formatWallClock(iso: string, timezone: string): string {
  const tz = isValidTimeZone(timezone) ? timezone : "UTC";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
