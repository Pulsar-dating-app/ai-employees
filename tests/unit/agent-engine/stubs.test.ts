import { describe, expect, it } from "vitest";
import { determineIntent, validateResponse } from "@/lib/agent-engine/stubs";

// Steps 6/10 -- documented stubs. These tests just pin the placeholder
// behavior so a future ticket replacing one of them (C7 for
// validateResponse) does so deliberately, not by silent regression.
describe("determineIntent (step 6 stub)", () => {
  it("returns a stable placeholder regardless of input", () => {
    expect(determineIntent("I want to buy this")).toBe("unknown");
    expect(determineIntent("")).toBe("unknown");
  });
});

describe("validateResponse (step 10 stub)", () => {
  it("passes the text through unchanged", () => {
    expect(validateResponse("Here's what we have in stock.")).toBe("Here's what we have in stock.");
  });
});
