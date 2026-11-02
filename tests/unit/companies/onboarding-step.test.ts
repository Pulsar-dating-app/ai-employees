import { describe, expect, it } from "vitest";
import {
  redirectTargetFor,
  safeDashboardPath,
  safeFinishTarget,
  finishChannel,
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

describe("safeFinishTarget", () => {
  const start = "/api/companies/1b017b3d-2e9e-467a-9259-0fdc278222b4/agents/ana/instagram/connect/start";

  it("lets the live step go straight to the Instagram login", () => {
    expect(safeFinishTarget(start)).toBe(start);
    expect(finishChannel(start)).toBe("instagram");
    expect(safeFinishTarget(`${start}?from=onboarding`)).toBe(`${start}?from=onboarding`);
    expect(finishChannel(`${start}?from=onboarding`)).toBe("instagram");
  });

  it("keeps dashboard paths and refuses any other API route", () => {
    expect(safeFinishTarget("/dashboard/my-agents/ana?canal=whatsapp")).toBe("/dashboard/my-agents/ana?canal=whatsapp");
    expect(finishChannel("/dashboard/my-agents/ana?canal=whatsapp")).toBe("whatsapp");
    expect(finishChannel("/dashboard")).toBe("dashboard");
    for (const next of [
      "/api/companies/1b017b3d-2e9e-467a-9259-0fdc278222b4/agents/ana/instagram",
      "/api/companies/x/agents/ana/instagram/connect/start",
      `${start}?next=https://evil.example`,
      `${start}?from=onboarding&next=https://evil.example`,
      `https://evil.example${start}`,
    ]) {
      expect(safeFinishTarget(next)).toBe("/dashboard");
    }
  });
});
