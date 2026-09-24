import { describe, expect, it } from "vitest";
import { buildSetupChecklist, type SetupFacts } from "@/lib/setup/checklist";

const base: SetupFacts = {
  hiredSlugs: [],
  planChosen: false,
  businessInfoFilled: false,
  productsCount: 0,
  hasOpenHours: false,
  hasServices: false,
  calendarAvailable: true,
  calendarConnected: false,
  channelLive: false,
};

describe("buildSetupChecklist", () => {
  it("only includes steps for the team members that were hired", () => {
    expect(buildSetupChecklist({ ...base, hiredSlugs: ["malu"] }).map((s) => s.key)).toEqual([
      "plan",
      "business",
      "products",
      "channel",
    ]);
    expect(buildSetupChecklist({ ...base, hiredSlugs: ["ana"] }).map((s) => s.key)).toEqual([
      "plan",
      "business",
      "hours",
      "services",
      "calendar",
      "channel",
    ]);
  });

  it("leaves the calendar step out when Google Calendar isn't available", () => {
    const keys = buildSetupChecklist({ ...base, hiredSlugs: ["ana"], calendarAvailable: false }).map((s) => s.key);
    expect(keys).not.toContain("calendar");
  });

  it("marks each step done from its own fact", () => {
    const steps = buildSetupChecklist({
      ...base,
      hiredSlugs: ["malu", "ana"],
      planChosen: true,
      businessInfoFilled: true,
      productsCount: 3,
      hasOpenHours: true,
      hasServices: false,
      calendarConnected: true,
      channelLive: false,
    });
    const done = Object.fromEntries(steps.map((s) => [s.key, s.done]));
    expect(done).toEqual({
      plan: true,
      business: true,
      products: true,
      hours: true,
      services: false,
      calendar: true,
      channel: false,
    });
  });

  it("sends the channel step to the first hire's page, or My Team with nobody hired", () => {
    expect(buildSetupChecklist({ ...base, hiredSlugs: ["ana", "malu"] }).at(-1)?.href).toBe("/dashboard/my-agents/ana");
    expect(buildSetupChecklist(base).at(-1)?.href).toBe("/dashboard");
  });
});
