import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { loadSchedulingSetup } from "@/lib/scheduling/setup";

async function createCompany(ownerCookie: string, name: string) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
  return created.json.company.id;
}

describe("loadSchedulingSetup(): Ana's scheduling readiness, read under RLS", () => {
  it("reports an empty setup for a fresh company", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Fresh Setup Co");

    const setup = await loadSchedulingSetup(owner.client, companyId);
    expect(setup.openDays).toBe(0);
    expect(setup.servicesCount).toBe(0);
    expect(setup.calendarConnected).toBe(false);
    expect(setup.requiresApproval).toBe(false);
  });

  it("counts distinct open days (split shifts count once) and active non-default services", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Configured Setup Co");

    const hours = await api("PUT", `/api/companies/${companyId}/business-hours`, owner.cookieHeader, {
      businessHours: [
        { day_of_week: 1, start_time: "09:00", end_time: "12:00" },
        { day_of_week: 1, start_time: "13:00", end_time: "18:00" },
        { day_of_week: 2, start_time: "09:00", end_time: "18:00" },
      ],
    });
    expect(hours.status).toBe(200);

    for (const name of ["Corte", "Coloração"]) {
      const created = await api("POST", `/api/companies/${companyId}/services`, owner.cookieHeader, {
        name,
        duration_minutes: 30,
      });
      expect(created.status).toBe(201);
    }
    const approval = await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
      requires_appointment_approval: true,
    });
    expect(approval.status).toBe(200);

    const setup = await loadSchedulingSetup(owner.client, companyId);
    expect(setup.openDays).toBe(2);
    expect(setup.servicesCount).toBe(2);
    expect(setup.requiresApproval).toBe(true);
  });

  it("shows an outsider nothing about another company's setup", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Private Setup Co");
    await api("PUT", `/api/companies/${companyId}/business-hours`, owner.cookieHeader, {
      businessHours: [{ day_of_week: 3, start_time: "09:00", end_time: "18:00" }],
    });

    const outsider = await signUpTestUser("outsider");
    const setup = await loadSchedulingSetup(outsider.client, companyId);
    expect(setup.openDays).toBe(0);
    expect(setup.servicesCount).toBe(0);
  });
});
