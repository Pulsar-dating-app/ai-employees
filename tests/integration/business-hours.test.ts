import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello H2 — business_hours: a recurring weekly template, whole-array-
// replace on PUT (same semantics as F2's FAQ section, just over a real
// table).
describe("Business hours GET/PUT /api/companies/:id/business-hours", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check Co");

    expect((await api("GET", `/api/companies/${companyId}/business-hours`)).status).toBe(401);
    expect((await api("PUT", `/api/companies/${companyId}/business-hours`)).status).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only Co");

    expect((await api("GET", `/api/companies/${companyId}/business-hours`, outsider.cookieHeader)).status).toBe(403);
    expect(
      (await api("PUT", `/api/companies/${companyId}/business-hours`, outsider.cookieHeader, { businessHours: [] })).status,
    ).toBe(403);
  });

  it("starts empty for a new company", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Fresh Co");

    const res = await api<{ businessHours: unknown[] }>(
      "GET",
      `/api/companies/${companyId}/business-hours`,
      owner.cookieHeader,
    );
    expect(res.status).toBe(200);
    expect(res.json.businessHours).toEqual([]);
  });

  it("rejects an out-of-range day_of_week", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Day Co");

    const res = await api(
      "PUT",
      `/api/companies/${companyId}/business-hours`,
      owner.cookieHeader,
      { businessHours: [{ day_of_week: 7, start_time: "09:00", end_time: "17:00" }] },
    );
    expect(res.status).toBe(400);
  });

  it("rejects end_time before start_time", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Range Co");

    const res = await api(
      "PUT",
      `/api/companies/${companyId}/business-hours`,
      owner.cookieHeader,
      { businessHours: [{ day_of_week: 1, start_time: "17:00", end_time: "09:00" }] },
    );
    expect(res.status).toBe(400);
  });

  it("rejects a malformed time string", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Time Co");

    const res = await api(
      "PUT",
      `/api/companies/${companyId}/business-hours`,
      owner.cookieHeader,
      { businessHours: [{ day_of_week: 1, start_time: "9am", end_time: "17:00" }] },
    );
    expect(res.status).toBe(400);
  });

  it("replaces the whole set and allows split shifts on the same day", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Split Shift Co");

    const firstPut = await api<{ businessHours: { day_of_week: number; start_time: string }[] }>(
      "PUT",
      `/api/companies/${companyId}/business-hours`,
      owner.cookieHeader,
      {
        businessHours: [
          { day_of_week: 1, start_time: "09:00", end_time: "12:00" },
          { day_of_week: 1, start_time: "14:00", end_time: "18:00" },
          { day_of_week: 2, start_time: "09:00", end_time: "17:00" },
        ],
      },
    );
    expect(firstPut.status).toBe(200);
    expect(firstPut.json.businessHours).toHaveLength(3);

    // Replacing again with a smaller set must fully replace, not merge.
    const secondPut = await api<{ businessHours: { day_of_week: number }[] }>(
      "PUT",
      `/api/companies/${companyId}/business-hours`,
      owner.cookieHeader,
      { businessHours: [{ day_of_week: 3, start_time: "10:00", end_time: "16:00" }] },
    );
    expect(secondPut.status).toBe(200);
    expect(secondPut.json.businessHours).toHaveLength(1);

    const list = await api<{ businessHours: { day_of_week: number }[] }>(
      "GET",
      `/api/companies/${companyId}/business-hours`,
      owner.cookieHeader,
    );
    expect(list.json.businessHours).toHaveLength(1);
    expect(list.json.businessHours[0].day_of_week).toBe(3);
  });

  it("can be cleared entirely with an empty array", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Clearable Co");

    await api("PUT", `/api/companies/${companyId}/business-hours`, owner.cookieHeader, {
      businessHours: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }],
    });

    const cleared = await api<{ businessHours: unknown[] }>(
      "PUT",
      `/api/companies/${companyId}/business-hours`,
      owner.cookieHeader,
      { businessHours: [] },
    );
    expect(cleared.status).toBe(200);
    expect(cleared.json.businessHours).toEqual([]);
  });
});
