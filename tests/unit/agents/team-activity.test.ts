import { describe, expect, it } from "vitest";
import { summarizeTeamActivity, type ActivityConversationRow } from "@/lib/agents/team-activity";

const NOW = new Date("2026-09-23T12:00:00Z").getTime();
const SINCE = NOW - 7 * 86_400_000;

function row(overrides: Partial<ActivityConversationRow>): ActivityConversationRow {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    agent_id: "malu",
    status: "active",
    updated_at: "2026-09-22T10:00:00Z",
    ...overrides,
  };
}

describe("summarizeTeamActivity", () => {
  it("counts conversations active inside the window per team member", () => {
    const result = summarizeTeamActivity(
      [row({}), row({}), row({ agent_id: "ana" }), row({ updated_at: "2026-09-01T00:00:00Z" })],
      [],
      SINCE,
    );
    expect(result.get("malu")).toEqual({ conversations: 2, needsYou: 0 });
    expect(result.get("ana")).toEqual({ conversations: 1, needsYou: 0 });
  });

  it("counts paused conversations as needing the merchant even outside the window", () => {
    const result = summarizeTeamActivity([row({ status: "paused", updated_at: "2026-08-01T00:00:00Z" })], [], SINCE);
    expect(result.get("malu")).toEqual({ conversations: 0, needsYou: 1 });
  });

  it("counts awaiting-confirmation conversations once, and never closed ones", () => {
    const result = summarizeTeamActivity(
      [row({ id: "a" }), row({ id: "b", status: "paused" }), row({ id: "c", status: "closed" })],
      ["a", "b", "c"],
      SINCE,
    );
    expect(result.get("malu")).toEqual({ conversations: 3, needsYou: 2 });
  });

  it("ignores conversations with no team member attached", () => {
    const result = summarizeTeamActivity([row({ agent_id: null, status: "paused" })], [], SINCE);
    expect(result.size).toBe(0);
  });
});
