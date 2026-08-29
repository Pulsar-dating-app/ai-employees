import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";

// Trello H3 — appointments CRUD, including the DB-level overlap-prevention
// constraint and the requires_appointment_approval status branch.
describe("Appointments CRUD /api/companies/:id/appointments", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function createService(cookie: string, companyId: string, body: Record<string, unknown>) {
    const res = await api<{ service: { id: string } }>(
      "POST",
      `/api/companies/${companyId}/services`,
      cookie,
      body,
    );
    return res.json.service.id;
  }

  // No customers CRUD API exists yet — insert directly via the signed-up
  // user's own RLS-scoped client, same escape hatch other integration
  // tests in this repo use for tables with no HTTP surface yet.
  async function createCustomer(owner: TestUser, companyId: string, name: string) {
    const { data, error } = await owner.client
      .from("customers")
      .insert({ company_id: companyId, name, phone: "+15550000000", channel: "whatsapp" })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async function createAppointment(cookie: string, companyId: string, body: Record<string, unknown>) {
    return api<{ appointment: { id: string; starts_at: string; ends_at: string; status: string } }>(
      "POST",
      `/api/companies/${companyId}/appointments`,
      cookie,
      body,
    );
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check Co");

    expect((await api("GET", `/api/companies/${companyId}/appointments`)).status).toBe(401);
    expect((await api("POST", `/api/companies/${companyId}/appointments`)).status).toBe(401);
    expect((await api("PATCH", `/api/companies/${companyId}/appointments/00000000-0000-0000-0000-000000000000`)).status).toBe(401);
    expect((await api("DELETE", `/api/companies/${companyId}/appointments/00000000-0000-0000-0000-000000000000`)).status).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only Co");

    expect((await api("GET", `/api/companies/${companyId}/appointments`, outsider.cookieHeader)).status).toBe(403);
    expect((await api("POST", `/api/companies/${companyId}/appointments`, outsider.cookieHeader, {})).status).toBe(403);
  });

  it("rejects creation without service_id, customer_id, or starts_at", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Missing Fields Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Cleaning", duration_minutes: 30 });
    const customerId = await createCustomer(owner, companyId, "Alice");

    expect((await createAppointment(owner.cookieHeader, companyId, { customer_id: customerId, starts_at: "2027-01-01T10:00:00Z" })).status).toBe(400);
    expect((await createAppointment(owner.cookieHeader, companyId, { service_id: serviceId, starts_at: "2027-01-01T10:00:00Z" })).status).toBe(400);
    expect((await createAppointment(owner.cookieHeader, companyId, { service_id: serviceId, customer_id: customerId })).status).toBe(400);
  });

  it("rejects a service_id or customer_id that doesn't belong to the company", async () => {
    const owner = await signUpTestUser("owner");
    const companyA = await createCompany(owner.cookieHeader, "Company A");
    const companyB = await createCompany(owner.cookieHeader, "Company B");
    const serviceInA = await createService(owner.cookieHeader, companyA, { name: "A Service", duration_minutes: 30 });
    const customerInB = await createCustomer(owner, companyB, "Bob");

    // Cross-company service_id, booked against company B.
    const badService = await createAppointment(owner.cookieHeader, companyB, {
      service_id: serviceInA,
      customer_id: customerInB,
      starts_at: "2027-01-01T10:00:00Z",
    });
    expect(badService.status).toBe(400);

    // Cross-company customer_id, booked against company A.
    const badCustomer = await createAppointment(owner.cookieHeader, companyA, {
      service_id: serviceInA,
      customer_id: customerInB,
      starts_at: "2027-01-01T10:00:00Z",
    });
    expect(badCustomer.status).toBe(400);
  });

  it("computes ends_at from the service's duration + buffer, and auto-confirms by default", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Duration Co");
    const serviceId = await createService(owner.cookieHeader, companyId, {
      name: "Consultation",
      duration_minutes: 30,
      buffer_minutes: 10,
    });
    const customerId = await createCustomer(owner, companyId, "Alice");

    const created = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: customerId,
      starts_at: "2027-01-01T10:00:00.000Z",
    });
    expect(created.status).toBe(201);
    expect(created.json.appointment.starts_at).toBe("2027-01-01T10:00:00+00:00");
    expect(new Date(created.json.appointment.ends_at).getTime() - new Date(created.json.appointment.starts_at).getTime()).toBe(
      40 * 60_000,
    );
    expect(created.json.appointment.status).toBe("confirmed");
  });

  it("holds a booking as 'requested' when the company requires approval", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Approval Co");
    await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, { requires_appointment_approval: true });

    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Surgery", duration_minutes: 60 });
    const customerId = await createCustomer(owner, companyId, "Alice");

    const created = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: customerId,
      starts_at: "2027-01-02T10:00:00.000Z",
    });
    expect(created.status).toBe(201);
    expect(created.json.appointment.status).toBe("requested");
  });

  it("rejects an overlapping booking with 409, but allows back-to-back bookings after the buffer", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Overlap Co");
    const serviceId = await createService(owner.cookieHeader, companyId, {
      name: "Cleaning",
      duration_minutes: 30,
      buffer_minutes: 0,
    });
    const alice = await createCustomer(owner, companyId, "Alice");
    const bob = await createCustomer(owner, companyId, "Bob");

    const first = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: alice,
      starts_at: "2027-01-03T10:00:00.000Z",
    });
    expect(first.status).toBe(201);

    // Starts 15 minutes into the first appointment — overlaps.
    const overlapping = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: bob,
      starts_at: "2027-01-03T10:15:00.000Z",
    });
    expect(overlapping.status).toBe(409);

    // Starts exactly when the first ends — back-to-back, not overlapping.
    const backToBack = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: bob,
      starts_at: "2027-01-03T10:30:00.000Z",
    });
    expect(backToBack.status).toBe(201);
  });

  it("cancelling an appointment frees its slot for a new booking", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Free Slot Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Cleaning", duration_minutes: 30 });
    const alice = await createCustomer(owner, companyId, "Alice");
    const bob = await createCustomer(owner, companyId, "Bob");

    const first = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: alice,
      starts_at: "2027-01-04T10:00:00.000Z",
    });
    expect(first.status).toBe(201);

    const cancelled = await api<{ appointment: { status: string } }>(
      "DELETE",
      `/api/companies/${companyId}/appointments/${first.json.appointment.id}`,
      owner.cookieHeader,
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.json.appointment.status).toBe("cancelled");

    // Idempotent — cancelling again is a no-op, not an error.
    expect(
      (await api("DELETE", `/api/companies/${companyId}/appointments/${first.json.appointment.id}`, owner.cookieHeader)).status,
    ).toBe(200);

    const rebooked = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: bob,
      starts_at: "2027-01-04T10:00:00.000Z",
    });
    expect(rebooked.status).toBe(201);
  });

  it("PATCH updates status/notes and rejects an invalid status", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Patch Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Cleaning", duration_minutes: 30 });
    const customerId = await createCustomer(owner, companyId, "Alice");
    const created = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: customerId,
      starts_at: "2027-01-05T10:00:00.000Z",
    });

    const badStatus = await api(
      "PATCH",
      `/api/companies/${companyId}/appointments/${created.json.appointment.id}`,
      owner.cookieHeader,
      { status: "not_a_real_status" },
    );
    expect(badStatus.status).toBe(400);

    const goodUpdate = await api<{ appointment: { status: string; notes: string } }>(
      "PATCH",
      `/api/companies/${companyId}/appointments/${created.json.appointment.id}`,
      owner.cookieHeader,
      { status: "completed", notes: "Went well" },
    );
    expect(goodUpdate.status).toBe(200);
    expect(goodUpdate.json.appointment.status).toBe("completed");
    expect(goodUpdate.json.appointment.notes).toBe("Went well");
  });

  it("PATCH reschedule recomputes ends_at and re-checks the overlap constraint", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Reschedule Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Cleaning", duration_minutes: 30 });
    const alice = await createCustomer(owner, companyId, "Alice");
    const bob = await createCustomer(owner, companyId, "Bob");

    const blocker = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: bob,
      starts_at: "2027-01-06T14:00:00.000Z",
    });
    expect(blocker.status).toBe(201);

    const created = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: alice,
      starts_at: "2027-01-06T10:00:00.000Z",
    });
    expect(created.status).toBe(201);

    // Reschedule into the blocker's slot — rejected.
    const rescheduleIntoConflict = await api(
      "PATCH",
      `/api/companies/${companyId}/appointments/${created.json.appointment.id}`,
      owner.cookieHeader,
      { starts_at: "2027-01-06T14:10:00.000Z" },
    );
    expect(rescheduleIntoConflict.status).toBe(409);

    // Reschedule somewhere free — succeeds and moves ends_at with it.
    const rescheduleOk = await api<{ appointment: { starts_at: string; ends_at: string } }>(
      "PATCH",
      `/api/companies/${companyId}/appointments/${created.json.appointment.id}`,
      owner.cookieHeader,
      { starts_at: "2027-01-06T11:00:00.000Z" },
    );
    expect(rescheduleOk.status).toBe(200);
    expect(rescheduleOk.json.appointment.starts_at).toBe("2027-01-06T11:00:00+00:00");
    expect(
      new Date(rescheduleOk.json.appointment.ends_at).getTime() - new Date(rescheduleOk.json.appointment.starts_at).getTime(),
    ).toBe(30 * 60_000);
  });

  it("404s on a cross-company appointment id", async () => {
    const owner = await signUpTestUser("owner");
    const companyA = await createCompany(owner.cookieHeader, "Company A");
    const companyB = await createCompany(owner.cookieHeader, "Company B");
    const serviceInA = await createService(owner.cookieHeader, companyA, { name: "A Service", duration_minutes: 30 });
    const customerInA = await createCustomer(owner, companyA, "Alice");
    const created = await createAppointment(owner.cookieHeader, companyA, {
      service_id: serviceInA,
      customer_id: customerInA,
      starts_at: "2027-01-07T10:00:00.000Z",
    });

    expect(
      (await api("PATCH", `/api/companies/${companyB}/appointments/${created.json.appointment.id}`, owner.cookieHeader, { notes: "x" }))
        .status,
    ).toBe(404);
    expect(
      (await api("DELETE", `/api/companies/${companyB}/appointments/${created.json.appointment.id}`, owner.cookieHeader)).status,
    ).toBe(404);
  });

  it("lists appointments filtered by status and date range, soonest-first", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "List Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Cleaning", duration_minutes: 30 });
    const customerId = await createCustomer(owner, companyId, "Alice");

    const later = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: customerId,
      starts_at: "2027-02-02T10:00:00.000Z",
    });
    const sooner = await createAppointment(owner.cookieHeader, companyId, {
      service_id: serviceId,
      customer_id: customerId,
      starts_at: "2027-02-01T10:00:00.000Z",
    });

    const list = await api<{ appointments: { id: string }[] }>(
      "GET",
      `/api/companies/${companyId}/appointments`,
      owner.cookieHeader,
    );
    expect(list.json.appointments.map((a) => a.id)).toEqual([sooner.json.appointment.id, later.json.appointment.id]);

    const rangeFiltered = await api<{ appointments: { id: string }[] }>(
      "GET",
      `/api/companies/${companyId}/appointments?from=2027-02-02T00:00:00.000Z`,
      owner.cookieHeader,
    );
    expect(rangeFiltered.json.appointments.map((a) => a.id)).toEqual([later.json.appointment.id]);

    const statusFiltered = await api<{ appointments: unknown[] }>(
      "GET",
      `/api/companies/${companyId}/appointments?status=cancelled`,
      owner.cookieHeader,
    );
    expect(statusFiltered.json.appointments).toEqual([]);
  });
});
