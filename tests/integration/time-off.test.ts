import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello K3 (time-off extension) — company_time_off + its routes, plus the
// one that matters: the availability engine folds a block into the same
// `busy` list as appointments and Google free/busy, so a blocked day offers
// no slots. Company timezone is left unset (defaults to UTC), so local
// wall-clock == UTC in the fixtures below.
describe("Company time off — /api/companies/:id/time-off", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function addMember(ownerCookie: string, companyId: string, userId: string) {
    await api("POST", `/api/companies/${companyId}/members`, ownerCookie, { userId, role: "member" });
  }

  function list(cookie: string, companyId: string, query = "") {
    return api<{ timeOff: { id: string; start_date: string; end_date: string; reason: string | null }[] }>(
      "GET",
      `/api/companies/${companyId}/time-off${query}`,
      cookie,
    );
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check TimeOff Co");

    expect((await api("GET", `/api/companies/${companyId}/time-off`)).status).toBe(401);
    expect(
      (await api("POST", `/api/companies/${companyId}/time-off`, undefined, {
        startDate: "2027-06-01",
        endDate: "2027-06-05",
      })).status,
    ).toBe(401);
    expect(
      (await api("DELETE", `/api/companies/${companyId}/time-off/00000000-0000-0000-0000-000000000000`))
        .status,
    ).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only TimeOff Co");

    expect((await list(outsider.cookieHeader, companyId)).status).toBe(403);
    expect(
      (await api("POST", `/api/companies/${companyId}/time-off`, outsider.cookieHeader, {
        startDate: "2027-06-01",
        endDate: "2027-06-05",
      })).status,
    ).toBe(403);
  });

  it("validates the dates on POST", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Dates TimeOff Co");
    const base = `/api/companies/${companyId}/time-off`;

    expect((await api("POST", base, owner.cookieHeader, { startDate: "01/06/2027", endDate: "2027-06-05" })).status).toBe(400);
    expect((await api("POST", base, owner.cookieHeader, { startDate: "2027-06-01" })).status).toBe(400);
    expect(
      (await api("POST", base, owner.cookieHeader, { startDate: "2027-06-05", endDate: "2027-06-01" })).status,
    ).toBe(400);
  });

  it("a member can add, list, and remove time off (reason optional, round-trips)", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "CRUD TimeOff Co");
    await addMember(owner.cookieHeader, companyId, member.userId);

    const created = await api<{ timeOff: { id: string; reason: string | null } }>(
      "POST",
      `/api/companies/${companyId}/time-off`,
      member.cookieHeader,
      { startDate: "2027-06-10", endDate: "2027-06-15", reason: "  Vacation  " },
    );
    expect(created.status).toBe(201);
    expect(created.json.timeOff.reason).toBe("Vacation"); // trimmed

    const single = await api<{ timeOff: { id: string } }>(
      "POST",
      `/api/companies/${companyId}/time-off`,
      member.cookieHeader,
      { startDate: "2027-07-04", endDate: "2027-07-04" },
    );
    expect(single.status).toBe(201);

    const after = await list(member.cookieHeader, companyId);
    expect(after.json.timeOff.map((t) => t.start_date)).toEqual(["2027-06-10", "2027-07-04"]);

    const del = await api("DELETE", `/api/companies/${companyId}/time-off/${created.json.timeOff.id}`, member.cookieHeader);
    expect(del.status).toBe(200);

    const remaining = await list(member.cookieHeader, companyId);
    expect(remaining.json.timeOff.map((t) => t.id)).toEqual([single.json.timeOff.id]);
  });

  it("404s deleting an unknown id", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Missing TimeOff Co");

    const res = await api(
      "DELETE",
      `/api/companies/${companyId}/time-off/00000000-0000-0000-0000-000000000000`,
      owner.cookieHeader,
    );
    expect(res.status).toBe(404);
  });

  it("?upcoming=true drops entries whose end_date has passed", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Upcoming TimeOff Co");

    await api("POST", `/api/companies/${companyId}/time-off`, owner.cookieHeader, {
      startDate: "2000-01-01",
      endDate: "2000-01-03",
    });
    await api("POST", `/api/companies/${companyId}/time-off`, owner.cookieHeader, {
      startDate: "2099-12-01",
      endDate: "2099-12-05",
    });

    expect((await list(owner.cookieHeader, companyId)).json.timeOff).toHaveLength(2);
    const upcoming = await list(owner.cookieHeader, companyId, "?upcoming=true");
    expect(upcoming.json.timeOff.map((t) => t.start_date)).toEqual(["2099-12-01"]);
  });

  it("removes a blocked day from availability, leaving adjacent days open", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Availability TimeOff Co");
    const service = await api<{ service: { id: string } }>(
      "POST",
      `/api/companies/${companyId}/services`,
      owner.cookieHeader,
      { name: "Consult", duration_minutes: 30 },
    );
    const serviceId = service.json.service.id;
    // day_of_week 1 = Monday. 2027-03-01 and 2027-03-08 are both Mondays.
    await api("PUT", `/api/companies/${companyId}/business-hours`, owner.cookieHeader, {
      businessHours: [{ day_of_week: 1, start_time: "09:00", end_time: "10:00" }],
    });

    await api("POST", `/api/companies/${companyId}/time-off`, owner.cookieHeader, {
      startDate: "2027-03-01",
      endDate: "2027-03-01",
      reason: "Closed",
    });

    const blocked = await api<{
      slots: unknown[];
      timeOff: { start: string; end: string; reason: string | null }[];
    }>(
      "GET",
      `/api/companies/${companyId}/services/${serviceId}/availability?from=2027-03-01&to=2027-03-01`,
      owner.cookieHeader,
    );
    expect(blocked.status).toBe(200);
    expect(blocked.json.slots).toEqual([]);
    // The reason travels back so the agent can say *why*, not just "nothing free".
    expect(blocked.json.timeOff).toEqual([
      { start: "2027-03-01", end: "2027-03-01", reason: "Closed" },
    ]);

    const openMonday = await api<{ slots: { start: string }[]; timeOff: unknown[] }>(
      "GET",
      `/api/companies/${companyId}/services/${serviceId}/availability?from=2027-03-08&to=2027-03-08`,
      owner.cookieHeader,
    );
    expect(openMonday.json.slots.map((s) => s.start)).toEqual([
      "2027-03-08T09:00:00.000Z",
      "2027-03-08T09:30:00.000Z",
    ]);
    expect(openMonday.json.timeOff).toEqual([]);
  });

  it("book_appointment / POST appointments refuses a time inside a block", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Book Blocked TimeOff Co");
    const service = await api<{ service: { id: string } }>(
      "POST",
      `/api/companies/${companyId}/services`,
      owner.cookieHeader,
      { name: "Consult", duration_minutes: 30 },
    );
    const serviceId = service.json.service.id;
    await api("PUT", `/api/companies/${companyId}/business-hours`, owner.cookieHeader, {
      businessHours: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }],
    });
    const { data: customer } = await owner.client
      .from("customers")
      .insert({ company_id: companyId, name: "C", phone: "+15550000000", channel: "whatsapp" })
      .select("id")
      .single();

    await api("POST", `/api/companies/${companyId}/time-off`, owner.cookieHeader, {
      startDate: "2027-03-01",
      endDate: "2027-03-01",
    });

    const res = await api(
      "POST",
      `/api/companies/${companyId}/appointments`,
      owner.cookieHeader,
      {
        service_id: serviceId,
        customer_id: (customer as { id: string }).id,
        starts_at: "2027-03-01T10:00:00.000Z",
      },
    );
    expect(res.status).toBe(400);
  });
});
