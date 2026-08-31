import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello ticket K6 -- PATCH /api/companies/:id/agents/:agentSlug is the only
// write path for company_agents.status after the initial hire. A plain
// on/off switch per hire: "active" <-> "paused", admin-gated, no schema
// change (the enum already has both values). Not a router -- it never
// touches sibling hires.
describe("PATCH /api/companies/:id/agents/:agentSlug (active-agent toggle)", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function hire(ownerCookie: string, companyId: string) {
    await api("POST", `/api/companies/${companyId}/agents/malu`, ownerCookie, {});
  }

  async function addMember(ownerCookie: string, companyId: string, userId: string, role = "member") {
    await api("POST", `/api/companies/${companyId}/members`, ownerCookie, { userId, role });
  }

  function getStatus(cookie: string, companyId: string) {
    return api<{ companyAgent: { status: string } | null }>(
      "GET",
      `/api/companies/${companyId}/agents/malu`,
      cookie,
    );
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Toggle Auth Co");

    const res = await api("PATCH", `/api/companies/${companyId}/agents/malu`, undefined, {
      status: "paused",
    });
    expect(res.status).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Toggle Members Only Co");
    await hire(owner.cookieHeader, companyId);

    const res = await api("PATCH", `/api/companies/${companyId}/agents/malu`, outsider.cookieHeader, {
      status: "paused",
    });
    expect(res.status).toBe(403);
  });

  it("lets a plain member view status but not toggle it", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "Toggle Read Only Co");
    await hire(owner.cookieHeader, companyId);
    await addMember(owner.cookieHeader, companyId, member.userId);

    expect((await getStatus(member.cookieHeader, companyId)).status).toBe(200);

    const patch = await api("PATCH", `/api/companies/${companyId}/agents/malu`, member.cookieHeader, {
      status: "paused",
    });
    expect(patch.status).toBe(403);
  });

  it("404s for an agent slug that doesn't exist", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Toggle Unknown Agent Co");

    const res = await api("PATCH", `/api/companies/${companyId}/agents/does-not-exist`, owner.cookieHeader, {
      status: "paused",
    });
    expect(res.status).toBe(404);
  });

  it("404s when the agent exists but hasn't been hired", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Toggle Not Hired Co");

    const res = await api("PATCH", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader, {
      status: "paused",
    });
    expect(res.status).toBe(404);
  });

  it("400s for a status value outside active/paused", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Toggle Bad Value Co");
    await hire(owner.cookieHeader, companyId);

    expect(
      (await api("PATCH", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader, { status: "hired" }))
        .status,
    ).toBe(400);
    expect(
      (await api("PATCH", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader, {})).status,
    ).toBe(400);
  });

  it("pauses and re-activates an owner's hire, round-tripping through GET", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Toggle Round Trip Co");
    await hire(owner.cookieHeader, companyId);

    expect((await getStatus(owner.cookieHeader, companyId)).json.companyAgent?.status).toBe("active");

    const paused = await api<{ companyAgent: { status: string } }>(
      "PATCH",
      `/api/companies/${companyId}/agents/malu`,
      owner.cookieHeader,
      { status: "paused" },
    );
    expect(paused.status).toBe(200);
    expect(paused.json.companyAgent.status).toBe("paused");
    expect((await getStatus(owner.cookieHeader, companyId)).json.companyAgent?.status).toBe("paused");

    const reactivated = await api<{ companyAgent: { status: string } }>(
      "PATCH",
      `/api/companies/${companyId}/agents/malu`,
      owner.cookieHeader,
      { status: "active" },
    );
    expect(reactivated.status).toBe(200);
    expect(reactivated.json.companyAgent.status).toBe("active");
    expect((await getStatus(owner.cookieHeader, companyId)).json.companyAgent?.status).toBe("active");
  });

  it("silences the dev-chat-test route while paused", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Toggle Dev Chat Co");
    await hire(owner.cookieHeader, companyId);
    await api("PATCH", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader, { status: "paused" });

    // The status check short-circuits with a 403 before AgentEngine.run()
    // (and any real OpenAI call) is ever reached — safe to assert here.
    const res = await api(
      "POST",
      `/api/companies/${companyId}/agents/malu/dev-chat-test`,
      owner.cookieHeader,
      { message: "hello" },
    );
    expect(res.status).toBe(403);
  });

  it("an admin (not just the owner) can toggle", async () => {
    const owner = await signUpTestUser("owner");
    const admin = await signUpTestUser("admin");
    const companyId = await createCompany(owner.cookieHeader, "Toggle Admin Co");
    await hire(owner.cookieHeader, companyId);
    await addMember(owner.cookieHeader, companyId, admin.userId, "admin");

    const res = await api("PATCH", `/api/companies/${companyId}/agents/malu`, admin.cookieHeader, {
      status: "paused",
    });
    expect(res.status).toBe(200);
  });
});
