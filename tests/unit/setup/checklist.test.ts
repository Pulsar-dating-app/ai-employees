import { describe, expect, it } from "vitest";
import { buildSetupChecklist, type SetupFacts } from "@/lib/setup/checklist";

const base: SetupFacts = {
  hiredSlugs: [],
  planChosen: false,
  productsCount: 0,
  hasOpenHours: false,
  hasServices: false,
  channelLive: false,
};

describe("buildSetupChecklist", () => {
  it("only includes steps for the team members that were hired", () => {
    expect(buildSetupChecklist({ ...base, hiredSlugs: ["malu"] }).map((s) => s.key)).toEqual([
      "plan",
      "products",
      "channel",
    ]);
    expect(buildSetupChecklist({ ...base, hiredSlugs: ["ana"] }).map((s) => s.key)).toEqual([
      "plan",
      "hours",
      "services",
      "channel",
    ]);
  });

  // What onboarding already covered is done, so the channel is what comes up
  // next. Business details and the calendar are optional and never listed.
  it("puts the channel next once she has what she needs to work", () => {
    const steps = buildSetupChecklist({
      ...base,
      hiredSlugs: ["ana"],
      planChosen: true,
      hasOpenHours: true,
      hasServices: true,
    });
    expect(steps.find((s) => !s.done)?.key).toBe("channel");
  });

  it("marks each step done from its own fact", () => {
    const steps = buildSetupChecklist({
      ...base,
      hiredSlugs: ["malu", "ana"],
      planChosen: true,
      productsCount: 3,
      hasOpenHours: true,
      hasServices: false,
      channelLive: false,
    });
    const done = Object.fromEntries(steps.map((s) => [s.key, s.done]));
    expect(done).toEqual({
      plan: true,
      products: true,
      hours: true,
      services: false,
      channel: false,
    });
  });

  it("sends the channel step to the first hire's page, or My Team with nobody hired", () => {
    const channelHref = (facts: SetupFacts) => buildSetupChecklist(facts).find((s) => s.key === "channel")?.href;
    expect(channelHref({ ...base, hiredSlugs: ["ana", "malu"] })).toBe("/dashboard/my-agents/ana");
    expect(channelHref(base)).toBe("/dashboard");
  });
});
