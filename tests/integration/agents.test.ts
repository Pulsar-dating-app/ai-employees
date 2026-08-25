import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello ticket B1 -- hiring is agent-scalable (agentSlug is a URL param,
// never hardcoded), so these tests exercise that generically via "malu"
// (seeded by migration 20260825181902_seed_malu_agent) rather than assuming
// it's the only agent that will ever exist.
describe("GET/POST /api/companies/:id/agents/:agentSlug", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check Co");

    expect((await api("GET", `/api/companies/${companyId}/agents/malu`)).status).toBe(401);
    expect((await api("POST", `/api/companies/${companyId}/agents/malu`)).status).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only Co");

    const get = await api("GET", `/api/companies/${companyId}/agents/malu`, outsider.cookieHeader);
    expect(get.status).toBe(403);

    const post = await api("POST", `/api/companies/${companyId}/agents/malu`, outsider.cookieHeader);
    expect(post.status).toBe(403);
  });

  it("404s for an agent slug that doesn't exist", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Unknown Agent Co");

    const get = await api("GET", `/api/companies/${companyId}/agents/does-not-exist`, owner.cookieHeader);
    expect(get.status).toBe(404);

    const post = await api("POST", `/api/companies/${companyId}/agents/does-not-exist`, owner.cookieHeader);
    expect(post.status).toBe(404);
  });

  it("hires Malu, is idempotent on a repeat hire, and reports status correctly", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Hiring Co");

    const before = await api<{ companyAgent: unknown }>(
      "GET",
      `/api/companies/${companyId}/agents/malu`,
      owner.cookieHeader,
    );
    expect(before.status).toBe(200);
    expect(before.json.companyAgent).toBeNull();

    const hired = await api<{ companyAgent: { id: string; name: string; status: string } }>(
      "POST",
      `/api/companies/${companyId}/agents/malu`,
      owner.cookieHeader,
    );
    expect(hired.status).toBe(201);
    expect(hired.json.companyAgent.status).toBe("active");
    expect(hired.json.companyAgent.name).toBe("Malu"); // default: slug capitalized

    const hiredAgain = await api<{ companyAgent: { id: string } }>(
      "POST",
      `/api/companies/${companyId}/agents/malu`,
      owner.cookieHeader,
    );
    expect(hiredAgain.status).toBe(200); // no-op, not a 409/500
    expect(hiredAgain.json.companyAgent.id).toBe(hired.json.companyAgent.id);

    const after = await api<{ companyAgent: { status: string } }>(
      "GET",
      `/api/companies/${companyId}/agents/malu`,
      owner.cookieHeader,
    );
    expect(after.json.companyAgent.status).toBe("active");
  });

  it("accepts a custom display name", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Custom Name Co");

    const hired = await api<{ companyAgent: { name: string } }>(
      "POST",
      `/api/companies/${companyId}/agents/malu`,
      owner.cookieHeader,
      { name: "Nossa Malu" },
    );
    expect(hired.status).toBe(201);
    expect(hired.json.companyAgent.name).toBe("Nossa Malu");
  });
});
