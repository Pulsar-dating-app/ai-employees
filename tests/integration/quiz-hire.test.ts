import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { getTestEnv } from "./helpers/env";
import { hireQuizAgent } from "@/lib/quiz/hire";

// A sign-up from the ad quiz skips onboarding's hire step: createCompany hires
// the quiz's agent with the merchant's own client. This runs that hire over
// real RLS, and checks the flow then treats the hire step as done.
describe("Hiring the ad quiz's agent", () => {
  async function createCompany(user: TestUser) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", user.cookieHeader, {
      name: `Quiz Co ${randomUUID().slice(0, 8)}`,
    });
    return created.json.company.id;
  }

  async function hires(companyId: string) {
    const { data } = await getTestServiceClient()
      .from("company_agents")
      .select("name, status, agents(slug)")
      .eq("company_id", companyId);
    return (data ?? []) as unknown as { name: string; status: string; agents: { slug: string } }[];
  }

  it("hires the agent as an active team member, and is idempotent", async () => {
    const owner = await signUpTestUser("quiz-hire-owner");
    const companyId = await createCompany(owner);

    expect(await hireQuizAgent(owner.client, companyId, "ana")).toBe(true);
    expect(await hireQuizAgent(owner.client, companyId, "ana")).toBe(true);

    const rows = await hires(companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Ana", status: "active", agents: { slug: "ana" } });
  });

  it("moves the merchant past the hire step", async () => {
    const owner = await signUpTestUser("quiz-hire-flow");
    const companyId = await createCompany(owner);
    await hireQuizAgent(owner.client, companyId, "ana");

    const { baseUrl } = getTestEnv();
    const res = await fetch(`${baseUrl}/onboarding/hire`, {
      headers: { cookie: owner.cookieHeader },
      redirect: "manual",
    });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!, baseUrl).pathname).toBe("/onboarding/setup");
  });

  it("cannot hire into someone else's company", async () => {
    const owner = await signUpTestUser("quiz-hire-victim");
    const stranger = await signUpTestUser("quiz-hire-stranger");
    const companyId = await createCompany(owner);

    expect(await hireQuizAgent(stranger.client, companyId, "ana")).toBe(false);
    expect(await hires(companyId)).toHaveLength(0);
  });

  it("falls back to the hire step for an unknown agent", async () => {
    const owner = await signUpTestUser("quiz-hire-unknown");
    const companyId = await createCompany(owner);

    expect(await hireQuizAgent(owner.client, companyId, "nobody")).toBe(false);
    expect(await hires(companyId)).toHaveLength(0);
  });
});
