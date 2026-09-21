// `googleCalendarChecked` says whether the merchant's Google Calendar was
// actually consulted when the slots were computed. It is real and useful to the
// availability engine and the dev screens, but it must not reach the model:
// every time it was false (no calendar connected, or one that failed) Ana
// passed it on as "o calendário ao vivo não pôde ser consultado" and hedged
// about a slot ("não consigo garantir a disponibilidade") that she then booked
// without any caveat. That is a merchant-side configuration matter -- the
// dashboard already flags "Google Calendar not connected" -- and jargon the
// customer should never hear. A slot the system returns is one the system
// stands behind.
//
// Stripped here, at the tool boundary, rather than removed from
// FindAvailableSlotsResult/FindNextAvailableResult: the repository result is
// also read by /api/.../availability and the dev availability screen, which
// show it on purpose.
export function omitCalendarSignal<T extends object>(result: T): Omit<T, "googleCalendarChecked"> {
  const rest = { ...result } as Record<string, unknown>;
  delete rest.googleCalendarChecked;
  return rest as Omit<T, "googleCalendarChecked">;
}
