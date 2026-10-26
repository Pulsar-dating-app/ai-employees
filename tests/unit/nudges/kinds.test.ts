import { describe, expect, it } from "vitest";
import { dueNudge, type NudgeFacts } from "@/lib/nudges/kinds";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-10-26T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * HOUR);

const facts = (overrides: Partial<NudgeFacts>): NudgeFacts => ({
  companyCreatedAt: hoursAgo(30),
  onboardingDone: false,
  channelLive: false,
  sent: [],
  ...overrides,
});

describe("dueNudge", () => {
  it("waits a day after sign-up, and gives up after a week", () => {
    expect(dueNudge(facts({ companyCreatedAt: hoursAgo(23) }), now)).toBeNull();
    expect(dueNudge(facts({ companyCreatedAt: hoursAgo(25) }), now)).toBe("onboarding_stalled");
    expect(dueNudge(facts({ companyCreatedAt: hoursAgo(24 * 7 + 1) }), now)).toBeNull();
  });

  it("asks a finished merchant who isn't live yet to share the link", () => {
    expect(dueNudge(facts({ onboardingDone: true }), now)).toBe("not_live");
  });

  it("has nothing to say to a merchant who is live", () => {
    expect(dueNudge(facts({ onboardingDone: true, channelLive: true }), now)).toBeNull();
  });

  it("sends each kind once", () => {
    expect(dueNudge(facts({ sent: [{ kind: "onboarding_stalled", sentAt: hoursAgo(100) }] }), now)).toBeNull();
  });

  it("never sends two nudges within three days", () => {
    const stalledThenFinished = facts({
      companyCreatedAt: hoursAgo(24 * 5),
      onboardingDone: true,
      sent: [{ kind: "onboarding_stalled", sentAt: hoursAgo(48) }],
    });
    expect(dueNudge(stalledThenFinished, now)).toBeNull();
    expect(dueNudge({ ...stalledThenFinished, sent: [{ kind: "onboarding_stalled", sentAt: hoursAgo(80) }] }, now)).toBe(
      "not_live",
    );
  });
});
