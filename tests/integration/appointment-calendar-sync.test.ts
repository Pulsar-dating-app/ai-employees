import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello I3 -- calendar sync hooked into H3's existing appointments CRUD
// routes. Google's Calendar API is stood in for by
// tests/integration/helpers/google-calendar-mock.ts (extended from I2's
// freeBusy-only mock to also cover events create/update/delete), wired in
// via GOOGLE_CALENDAR_API_BASE_URL.
describe("Calendar sync on appointment booking/cancel/reschedule", () => {
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

  async function createCustomer(owner: TestUser, companyId: string, name: string) {
    const { data, error } = await owner.client
      .from("customers")
      .insert({ company_id: companyId, name, phone: "+15550000000", channel: "whatsapp" })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  // Connects the calendar via the real I1 flow, then overwrites
  // google_calendar_id directly (the connect route always hard-codes
  // "primary") so the mock's magic-value scenarios can be selected --
  // same escape hatch I2's own tests use.
  async function connectCalendar(cookie: string, companyId: string, calendarId?: string) {
    await api("POST", `/api/companies/${companyId}/calendar/connect`, cookie, { code: "good-code" });
    if (calendarId) {
      await getTestServiceClient()
        .from("company_calendar_connections")
        .update({ google_calendar_id: calendarId })
        .eq("company_id", companyId);
    }
  }

  it("creates a Google event for an auto-confirmed booking on a connected calendar", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auto Confirm Sync Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Consult", duration_minutes: 30 });
    const customerId = await createCustomer(owner, companyId, "Jane Doe");
    await connectCalendar(owner.cookieHeader, companyId);

    const res = await api<{ appointment: { status: string; google_event_id: string | null } }>(
      "POST",
      `/api/companies/${companyId}/appointments`,
      owner.cookieHeader,
      { service_id: serviceId, customer_id: customerId, starts_at: "2027-03-01T09:00:00.000Z" },
    );
    expect(res.status).toBe(201);
    expect(res.json.appointment.status).toBe("confirmed");
    expect(res.json.appointment.google_event_id).toMatch(/^mock-event-/);
  });

  it("does not sync a requested appointment, then syncs it once a PATCH confirms it", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Manual Approval Sync Co");
    await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
      requires_appointment_approval: true,
    });
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Consult", duration_minutes: 30 });
    const customerId = await createCustomer(owner, companyId, "Jane Doe");
    await connectCalendar(owner.cookieHeader, companyId);

    const created = await api<{ appointment: { id: string; status: string; google_event_id: string | null } }>(
      "POST",
      `/api/companies/${companyId}/appointments`,
      owner.cookieHeader,
      { service_id: serviceId, customer_id: customerId, starts_at: "2027-03-01T09:00:00.000Z" },
    );
    expect(created.json.appointment.status).toBe("requested");
    expect(created.json.appointment.google_event_id).toBeNull();

    const confirmed = await api<{ appointment: { status: string; google_event_id: string | null } }>(
      "PATCH",
      `/api/companies/${companyId}/appointments/${created.json.appointment.id}`,
      owner.cookieHeader,
      { status: "confirmed" },
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.json.appointment.status).toBe("confirmed");
    expect(confirmed.json.appointment.google_event_id).toMatch(/^mock-event-/);
  });

  it("leaves google_event_id null with no error when no calendar is connected", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "No Calendar Sync Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Consult", duration_minutes: 30 });
    const customerId = await createCustomer(owner, companyId, "Jane Doe");

    const res = await api<{ appointment: { google_event_id: string | null } }>(
      "POST",
      `/api/companies/${companyId}/appointments`,
      owner.cookieHeader,
      { service_id: serviceId, customer_id: customerId, starts_at: "2027-03-01T09:00:00.000Z" },
    );
    expect(res.status).toBe(201);
    expect(res.json.appointment.google_event_id).toBeNull();
  });

  it("degrades gracefully (still 201, google_event_id null) when the Google events call fails", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Events Failure Sync Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Consult", duration_minutes: 30 });
    const customerId = await createCustomer(owner, companyId, "Jane Doe");
    await connectCalendar(owner.cookieHeader, companyId, "trigger-events-failure");

    const res = await api<{ appointment: { google_event_id: string | null } }>(
      "POST",
      `/api/companies/${companyId}/appointments`,
      owner.cookieHeader,
      { service_id: serviceId, customer_id: customerId, starts_at: "2027-03-01T09:00:00.000Z" },
    );
    expect(res.status).toBe(201);
    expect(res.json.appointment.google_event_id).toBeNull();
  });

  it("deletes the Google event and clears google_event_id on DELETE (cancel)", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Delete Cancel Sync Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Consult", duration_minutes: 30 });
    const customerId = await createCustomer(owner, companyId, "Jane Doe");
    await connectCalendar(owner.cookieHeader, companyId);

    const created = await api<{ appointment: { id: string; google_event_id: string } }>(
      "POST",
      `/api/companies/${companyId}/appointments`,
      owner.cookieHeader,
      { service_id: serviceId, customer_id: customerId, starts_at: "2027-03-01T09:00:00.000Z" },
    );
    expect(created.json.appointment.google_event_id).toBeTruthy();

    const cancelled = await api<{ appointment: { status: string; google_event_id: string | null } }>(
      "DELETE",
      `/api/companies/${companyId}/appointments/${created.json.appointment.id}`,
      owner.cookieHeader,
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.json.appointment.status).toBe("cancelled");
    expect(cancelled.json.appointment.google_event_id).toBeNull();
  });

  it("deletes the Google event and clears google_event_id on PATCH { status: cancelled }", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Patch Cancel Sync Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Consult", duration_minutes: 30 });
    const customerId = await createCustomer(owner, companyId, "Jane Doe");
    await connectCalendar(owner.cookieHeader, companyId);

    const created = await api<{ appointment: { id: string; google_event_id: string } }>(
      "POST",
      `/api/companies/${companyId}/appointments`,
      owner.cookieHeader,
      { service_id: serviceId, customer_id: customerId, starts_at: "2027-03-01T09:00:00.000Z" },
    );

    const cancelled = await api<{ appointment: { google_event_id: string | null } }>(
      "PATCH",
      `/api/companies/${companyId}/appointments/${created.json.appointment.id}`,
      owner.cookieHeader,
      { status: "cancelled", cancellation_reason: "Customer request" },
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.json.appointment.google_event_id).toBeNull();
  });

  it("updates the Google event's time on reschedule, keeping the same google_event_id", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Reschedule Sync Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Consult", duration_minutes: 30 });
    const customerId = await createCustomer(owner, companyId, "Jane Doe");
    await connectCalendar(owner.cookieHeader, companyId);

    const created = await api<{ appointment: { id: string; google_event_id: string } }>(
      "POST",
      `/api/companies/${companyId}/appointments`,
      owner.cookieHeader,
      { service_id: serviceId, customer_id: customerId, starts_at: "2027-03-01T09:00:00.000Z" },
    );
    const originalEventId = created.json.appointment.google_event_id;

    const rescheduled = await api<{ appointment: { starts_at: string; google_event_id: string | null } }>(
      "PATCH",
      `/api/companies/${companyId}/appointments/${created.json.appointment.id}`,
      owner.cookieHeader,
      { starts_at: "2027-03-01T10:00:00.000Z" },
    );
    expect(rescheduled.status).toBe(200);
    // PostgREST renders timestamptz as `+00:00`, not JS's `.000Z` — same
    // instant, different spelling. Matches how appointments.test.ts asserts
    // the identical field.
    expect(rescheduled.json.appointment.starts_at).toBe("2027-03-01T10:00:00+00:00");
    // Rescheduling updates the existing event in place -- the id doesn't change.
    expect(rescheduled.json.appointment.google_event_id).toBe(originalEventId);
  });

  it("does not error when cancelling an appointment whose Google event was already deleted externally", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Already Gone Sync Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Consult", duration_minutes: 30 });
    const customerId = await createCustomer(owner, companyId, "Jane Doe");
    await connectCalendar(owner.cookieHeader, companyId);

    const created = await api<{ appointment: { id: string } }>(
      "POST",
      `/api/companies/${companyId}/appointments`,
      owner.cookieHeader,
      { service_id: serviceId, customer_id: customerId, starts_at: "2027-03-01T09:00:00.000Z" },
    );
    // Force the stored google_event_id to the mock's magic "already gone"
    // value, simulating an event that was deleted by hand in Google
    // Calendar (I3 doesn't reconcile that automatically -- see the future
    // reverse-sync ticket).
    await getTestServiceClient()
      .from("appointments")
      .update({ google_event_id: "already-gone-event" })
      .eq("id", created.json.appointment.id);

    const cancelled = await api<{ appointment: { status: string; google_event_id: string | null } }>(
      "DELETE",
      `/api/companies/${companyId}/appointments/${created.json.appointment.id}`,
      owner.cookieHeader,
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.json.appointment.status).toBe("cancelled");
    expect(cancelled.json.appointment.google_event_id).toBeNull();
  });
});
