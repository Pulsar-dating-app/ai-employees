import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

describe("GET/POST /api/companies", () => {
  it("requires authentication", async () => {
    expect((await api("GET", "/api/companies")).status).toBe(401);
    expect((await api("POST", "/api/companies", undefined, { name: "Nope Co" })).status).toBe(401);
  });

  it("creates a company atomically and makes the creator its owner", async () => {
    const owner = await signUpTestUser("owner");

    const before = await api<{ companies: unknown[] }>("GET", "/api/companies", owner.cookieHeader);
    expect(before.status).toBe(200);
    expect(before.json.companies).toEqual([]);

    const created = await api<{ company: { id: string; name: string } }>(
      "POST",
      "/api/companies",
      owner.cookieHeader,
      { name: "Acme Co", currency: "USD", country: "US" },
    );
    expect(created.status).toBe(201);
    expect(created.json.company.name).toBe("Acme Co");

    const after = await api<{ companies: unknown[] }>("GET", "/api/companies", owner.cookieHeader);
    expect(after.json.companies).toHaveLength(1);
  });

  it("rejects a company with no name", async () => {
    const owner = await signUpTestUser("owner");
    const result = await api("POST", "/api/companies", owner.cookieHeader, {});
    expect(result.status).toBe(400);
  });
});

describe("POST /api/companies/:id/members", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  it("blocks non-members, validates the role, and rejects duplicate members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Beta Co");

    const blocked = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      outsider.cookieHeader,
      { userId: outsider.userId, role: "member" },
    );
    expect(blocked.status).toBe(403);

    const badRole = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      owner.cookieHeader,
      { userId: outsider.userId, role: "bogus" },
    );
    expect(badRole.status).toBe(400);

    const added = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      owner.cookieHeader,
      { userId: outsider.userId, role: "member" },
    );
    expect(added.status).toBe(201);

    const duplicate = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      owner.cookieHeader,
      { userId: outsider.userId, role: "member" },
    );
    expect(duplicate.status).toBe(409);

    const nowVisible = await api<{ companies: unknown[] }>("GET", "/api/companies", outsider.cookieHeader);
    expect(nowVisible.json.companies).toHaveLength(1);
  });

  it("only lets an existing owner assign the owner role", async () => {
    const owner = await signUpTestUser("owner");
    const admin = await signUpTestUser("admin");
    const target = await signUpTestUser("target");
    const companyId = await createCompany(owner.cookieHeader, "Gamma Co");

    await api("POST", `/api/companies/${companyId}/members`, owner.cookieHeader, {
      userId: admin.userId,
      role: "admin",
    });

    const adminPromotesToOwner = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      admin.cookieHeader,
      { userId: target.userId, role: "owner" },
    );
    expect(adminPromotesToOwner.status).toBe(403);

    const adminAddsMember = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      admin.cookieHeader,
      { userId: target.userId, role: "member" },
    );
    expect(adminAddsMember.status).toBe(201);
  });
});
