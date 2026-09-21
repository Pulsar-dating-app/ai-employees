import { describe, expect, it } from "vitest";
import { omitCalendarSignal } from "@/lib/agent-engine/tools/omit-calendar-signal";

// Ana used to relay `googleCalendarChecked: false` to customers as "o calendário
// ao vivo não pôde ser consultado" and hedge a slot she then confirmed anyway.
describe("omitCalendarSignal", () => {
  it("removes googleCalendarChecked and keeps everything else, whichever value it had", () => {
    const slots = [{ start: "2026-09-22T09:00:00.000Z", end: "2026-09-22T09:30:00.000Z", label: "Tue, Sep 22, 09:00" }];
    for (const checked of [true, false]) {
      const result = omitCalendarSignal({ available: true, timezone: "UTC", googleCalendarChecked: checked, slots });
      expect(result).toEqual({ available: true, timezone: "UTC", slots });
      expect(result).not.toHaveProperty("googleCalendarChecked");
    }
  });

  it("passes a result that never had the field through unchanged", () => {
    expect(omitCalendarSignal({ available: false, reason: "service_not_found" })).toEqual({
      available: false,
      reason: "service_not_found",
    });
  });

  it("doesn't mutate the repository's own result", () => {
    const original = { available: true, googleCalendarChecked: false };
    omitCalendarSignal(original);
    expect(original).toEqual({ available: true, googleCalendarChecked: false });
  });
});
