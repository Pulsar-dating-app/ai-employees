import { describe, expect, it } from "vitest";
import {
  redirectTargetFor,
  safeDashboardPath,
  stepAfterProof,
  type OnboardingState,
} from "@/lib/companies/onboarding-step";

const state = (overrides: Partial<OnboardingState>): OnboardingState => ({
  step: "ready",
  companyId: "c",
  companyName: "Co",
  agentSlug: "ana",
  agentId: "a",
  agentName: "Ana",
  planActive: false,
  ...overrides,
});

describe("stepAfterProof", () => {
  it("goes to the plan step when no plan is active", () => {
    expect(stepAfterProof(state({ planActive: false }))).toBe("/onboarding/plan");
  });

  // Quiz sign-ups start on Staffra Free, so there is nothing to choose.
  it("skips straight to going live when a plan is already active", () => {
    expect(stepAfterProof(state({ planActive: true }))).toBe("/onboarding/live");
  });
});

describe("redirectTargetFor and the live step", () => {
  it("sends anyone who hasn't reached it back to the step they are on", () => {
    expect(redirectTargetFor(state({ step: "setup" }), "live")).toBe("/onboarding/setup");
    expect(redirectTargetFor(state({ step: "plan" }), "live")).toBe("/onboarding/plan");
  });

  it("lets a merchant on the live step revisit the plan step", () => {
    expect(redirectTargetFor(state({ step: "live" }), "plan")).toBeNull();
    expect(redirectTargetFor(state({ step: "live" }), "live")).toBeNull();
  });
});

describe("safeDashboardPath", () => {
  it("keeps a dashboard path, with a simple query", () => {
    expect(safeDashboardPath("/dashboard")).toBe("/dashboard");
    expect(safeDashboardPath("/dashboard/my-agents/ana?canal=instagram")).toBe(
      "/dashboard/my-agents/ana?canal=instagram",
    );
  });

  it("falls back to the dashboard for anything else", () => {
    for (const next of [
      null,
      undefined,
      "",
      "//evil.example",
      "https://evil.example/dashboard",
      "/dashboard/../login",
      "/dashboardx",
      "/onboarding",
      "/dashboard?next=https://evil.example",
    ]) {
      expect(safeDashboardPath(next)).toBe("/dashboard");
    }
  });
});
