import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello H1 — services CRUD, scoped to company_id. Mirrors products.test.ts's
// conventions exactly (same helper shapes, same case coverage) since the
// route itself mirrors B3's products routes.
describe("Services CRUD /api/companies/:id/services", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function createService(cookie: string, companyId: string, body: Record<string, unknown>) {
    return api<{ service: { id: string } }>(
      "POST",
      `/api/companies/${companyId}/services`,
      cookie,
      body,
    );
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check Co");

    expect((await api("GET", `/api/companies/${companyId}/services`)).status).toBe(401);
    expect((await api("POST", `/api/companies/${companyId}/services`)).status).toBe(401);
    expect((await api("PATCH", `/api/companies/${companyId}/services/00000000-0000-0000-0000-000000000000`)).status).toBe(401);
    expect((await api("DELETE", `/api/companies/${companyId}/services/00000000-0000-0000-0000-000000000000`)).status).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only Co");
    const created = await createService(owner.cookieHeader, companyId, { name: "Cleaning", duration_minutes: 30 });

    expect((await api("GET", `/api/companies/${companyId}/services`, outsider.cookieHeader)).status).toBe(403);
    expect(
      (await api("POST", `/api/companies/${companyId}/services`, outsider.cookieHeader, { name: "X", duration_minutes: 10 })).status,
    ).toBe(403);
    expect(
      (
        await api(
          "PATCH",
          `/api/companies/${companyId}/services/${created.json.service.id}`,
          outsider.cookieHeader,
          { name: "Y" },
        )
      ).status,
    ).toBe(403);
    expect(
      (await api("DELETE", `/api/companies/${companyId}/services/${created.json.service.id}`, outsider.cookieHeader)).status,
    ).toBe(403);
  });

  it("rejects creation without a name", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "No Name Co");

    const res = await createService(owner.cookieHeader, companyId, { duration_minutes: 30 });
    expect(res.status).toBe(400);
  });

  it("rejects creation without a valid duration_minutes", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "No Duration Co");

    expect((await createService(owner.cookieHeader, companyId, { name: "Cleaning" })).status).toBe(400);
    expect((await createService(owner.cookieHeader, companyId, { name: "Cleaning", duration_minutes: 0 })).status).toBe(400);
    expect((await createService(owner.cookieHeader, companyId, { name: "Cleaning", duration_minutes: -5 })).status).toBe(400);
    expect((await createService(owner.cookieHeader, companyId, { name: "Cleaning", duration_minutes: 30.5 })).status).toBe(400);
  });

  it("rejects a negative buffer_minutes", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Buffer Co");

    const res = await createService(owner.cookieHeader, companyId, {
      name: "Cleaning",
      duration_minutes: 30,
      buffer_minutes: -5,
    });
    expect(res.status).toBe(400);
  });

  it("rejects a price without a currency", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "No Currency Co");

    const res = await createService(owner.cookieHeader, companyId, { name: "Cleaning", duration_minutes: 30, price: 100 });
    expect(res.status).toBe(400);
  });

  it("creates a service with every field and defaults buffer_minutes to 0", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Full Fields Co");

    const created = await api<{ service: { id: string; price: number } & Record<string, unknown> }>(
      "POST",
      `/api/companies/${companyId}/services`,
      owner.cookieHeader,
      {
        name: "First Consultation",
        description: "Initial visit",
        duration_minutes: 45,
        price: 200,
        currency: "BRL",
        category: "consultation",
      },
    );
    expect(created.status).toBe(201);
    expect(created.json.service).toMatchObject({
      name: "First Consultation",
      description: "Initial visit",
      duration_minutes: 45,
      category: "consultation",
      buffer_minutes: 0,
      is_active: true,
    });
    expect(Number(created.json.service.price)).toBe(200);

    const list = await api<{ services: { id: string }[] }>(
      "GET",
      `/api/companies/${companyId}/services`,
      owner.cookieHeader,
    );
    expect(list.status).toBe(200);
    expect(list.json.services.map((s) => s.id)).toContain(created.json.service.id);
  });

  it("404s updating/deleting a service that doesn't exist or belongs to another company", async () => {
    const owner = await signUpTestUser("owner");
    const companyA = await createCompany(owner.cookieHeader, "Company A");
    const companyB = await createCompany(owner.cookieHeader, "Company B");
    const serviceInA = await createService(owner.cookieHeader, companyA, { name: "A's Service", duration_minutes: 20 });

    expect(
      (
        await api(
          "PATCH",
          `/api/companies/${companyA}/services/00000000-0000-0000-0000-000000000000`,
          owner.cookieHeader,
          { name: "X" },
        )
      ).status,
    ).toBe(404);

    expect(
      (
        await api(
          "PATCH",
          `/api/companies/${companyB}/services/${serviceInA.json.service.id}`,
          owner.cookieHeader,
          { name: "X" },
        )
      ).status,
    ).toBe(404);

    expect(
      (await api("DELETE", `/api/companies/${companyB}/services/${serviceInA.json.service.id}`, owner.cookieHeader)).status,
    ).toBe(404);
  });

  it("updates a service, validating price/currency against the effective merged state", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Update Co");
    const created = await createService(owner.cookieHeader, companyId, {
      name: "Cleaning",
      duration_minutes: 30,
      price: 50,
      currency: "USD",
    });
    const serviceId = created.json.service.id;

    const badUpdate = await api(
      "PATCH",
      `/api/companies/${companyId}/services/${serviceId}`,
      owner.cookieHeader,
      { currency: null },
    );
    expect(badUpdate.status).toBe(400);

    const goodUpdate = await api<{ service: { duration_minutes: number } }>(
      "PATCH",
      `/api/companies/${companyId}/services/${serviceId}`,
      owner.cookieHeader,
      { duration_minutes: 60 },
    );
    expect(goodUpdate.status).toBe(200);
    expect(goodUpdate.json.service.duration_minutes).toBe(60);
  });

  it("soft-deletes a service: excluded from the default list, visible with includeInactive, reactivatable", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Soft Delete Co");
    const created = await createService(owner.cookieHeader, companyId, { name: "Doomed Service", duration_minutes: 15 });
    const serviceId = created.json.service.id;

    const deleted = await api<{ service: { is_active: boolean } }>(
      "DELETE",
      `/api/companies/${companyId}/services/${serviceId}`,
      owner.cookieHeader,
    );
    expect(deleted.status).toBe(200);
    expect(deleted.json.service.is_active).toBe(false);

    const defaultList = await api<{ services: { id: string }[] }>(
      "GET",
      `/api/companies/${companyId}/services`,
      owner.cookieHeader,
    );
    expect(defaultList.json.services.map((s) => s.id)).not.toContain(serviceId);

    const fullList = await api<{ services: { id: string }[] }>(
      "GET",
      `/api/companies/${companyId}/services?includeInactive=true`,
      owner.cookieHeader,
    );
    expect(fullList.json.services.map((s) => s.id)).toContain(serviceId);

    const reactivated = await api<{ service: { is_active: boolean } }>(
      "PATCH",
      `/api/companies/${companyId}/services/${serviceId}`,
      owner.cookieHeader,
      { is_active: true },
    );
    expect(reactivated.status).toBe(200);
    expect(reactivated.json.service.is_active).toBe(true);
  });

  it("filters by category and paginates", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Filter Co");
    await createService(owner.cookieHeader, companyId, { name: "Cleaning", duration_minutes: 30, category: "hygiene" });
    await createService(owner.cookieHeader, companyId, { name: "Whitening", duration_minutes: 45, category: "cosmetic" });

    const filtered = await api<{ services: { name: string }[] }>(
      "GET",
      `/api/companies/${companyId}/services?category=cosmetic`,
      owner.cookieHeader,
    );
    expect(filtered.json.services.map((s) => s.name)).toEqual(["Whitening"]);

    const paged = await api<{ services: unknown[]; total: number; page: number; pageSize: number }>(
      "GET",
      `/api/companies/${companyId}/services?pageSize=1&page=1`,
      owner.cookieHeader,
    );
    expect(paged.json.services).toHaveLength(1);
    expect(paged.json.total).toBe(2);
  });
});
