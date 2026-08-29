import { describe, expect, it } from "vitest";
import { determineIntent } from "@/lib/agent-engine/stubs";

// Step 6 -- a documented stub. This test just pins the placeholder behavior
// so a future ticket replacing it does so deliberately, not by silent
// regression. (Step 10's `validateResponse` used to be pinned here too;
// Trello C7 replaced it with the real grounding check -- see
// grounding.test.ts.)
describe("determineIntent (step 6 stub)", () => {
  it("returns a stable placeholder regardless of input", () => {
    expect(determineIntent("I want to buy this")).toBe("unknown");
    expect(determineIntent("")).toBe("unknown");
  });
});
