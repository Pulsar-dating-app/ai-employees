import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello I2 -- over real HTTP against the thin availability route (the real
// caller is J3's find_available_slots tool, calling loadAvailableSlots
// in-process; this route exists purely for testability, same as B5's
// products/search/route.ts). Google's freeBusy endpoint is stood in for by
// tests/integration/helpers/google-calendar-mock.ts, wired in via
// GOOGLE_CALENDAR_API_BASE_URL -- mocking Google is correct here since it's
// a genuine third-party dependency, not our own DB/RLS.
describe("Availability GET /api/companies/:id/services/:serviceId/availability", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, {
      name,
      // Business hours in these tests are written as UTC wall-clock times;
      // pin the zone so they are not shifted by the create-time default.
      timezone: "UTC",
    });
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

  async function setBusinessHours(cookie: string, companyId: string, windows: Record<string, unknown>[]) {
    await api("PUT", `/api/companies/${companyId}/business-hours`, cookie, { businessHours: windows });
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

  // Every fixture below books a Monday. dayOfWeek: 1 (0 = Sunday, per I2's
  // documented convention) matches this date in every test.
  const MONDAY = "2027-03-01";

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check Avail Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Cut", duration_minutes: 30 });

    const res = await api(
      "GET",
      `/api/companies/${companyId}/services/${serviceId}/availability?from=${MONDAY}&to=${MONDAY}`,
    );
    expect(res.status).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only Avail Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Cut", duration_minutes: 30 });

    const res = await api(
      "GET",
      `/api/companies/${companyId}/services/${serviceId}/availability?from=${MONDAY}&to=${MONDAY}`,
      outsider.cookieHeader,
    );
    expect(res.status).toBe(403);
  });

  it("rejects missing or malformed from/to", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Range Avail Co");
    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Cut", duration_minutes: 30 });
    const base = `/api/companies/${companyId}/services/${serviceId}/availability`;

    expect((await api("GET", `${base}?to=${MONDAY}`, owner.cookieHeader)).status).toBe(400);
    expect((await api("GET", `${base}?from=${MONDAY}`, owner.cookieHeader)).status).toBe(400);
    expect((await api("GET", `${base}?from=03/01/2027&to=${MONDAY}`, owner.cookieHeader)).status).toBe(400);
    expect((await api("GET", `${base}?from=2027-03-02&to=2027-03-01`, owner.cookieHeader)).status).toBe(400);
  });

  it("404s for an unknown or inactive service", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Missing Service Avail Co");

    const missing = await api(
      "GET",
      `/api/companies/${companyId}/services/00000000-0000-0000-0000-000000000000/availability?from=${MONDAY}&to=${MONDAY}`,
      owner.cookieHeader,
    );
    expect(missing.status).toBe(404);

    const serviceId = await createService(owner.cookieHeader, companyId, { name: "Cut", duration_minutes: 30 });
    await api("DELETE", `/api/companies/${companyId}/services/${serviceId}`, owner.cookieHeader);

    const inactive = await api(
      "GET",
      `/api/companies/${companyId}/services/${serviceId}/availability?from=${MONDAY}&to=${MONDAY}`,
      owner.cookieHeader,
    );
    expect(inactive.status).toBe(404);
  });

  it("returns slots from business_hours alone, googleCalendarChecked: false, when no calendar is connected", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "No Calendar Avail Co");
    const serviceId = await createService(owner.cookieHeader, companyId, {
      name: "Consult",
      duration_minutes: 30,
    });
    await setBusinessHours(owner.cookieHeader, companyId, [
      { day_of_week: 1, start_time: "09:00", end_time: "10:00" },
    ]);

    const res = await api<{ slots: { start: string; end: string }[]; googleCalendarChecked: boolean }>(
      "GET",
      `/api/companies/${companyId}/services/${serviceId}/availability?from=${MONDAY}&to=${MONDAY}`,
      owner.cookieHeader,
    );
    expect(res.status).toBe(200);
    expect(res.json.googleCalendarChecked).toBe(false);
    expect(res.json.slots).toHaveLength(2); // 09:00, 09:30
  });

  it("excludes a slot covered by an existing appointment", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Appointment Blocks Avail Co");
    const serviceId = await createService(owner.cookieHeader, companyId, {
      name: "Consult",
      duration_minutes: 30,
    });
    await setBusinessHours(owner.cookieHeader, companyId, [
      { day_of_week: 1, start_time: "09:00", end_time: "10:00" },
    ]);
    const customerId = await createCustomer(owner, companyId, "Existing Customer");

    await api("POST", `/api/companies/${companyId}/appointments`, owner.cookieHeader, {
      service_id: serviceId,
      customer_id: customerId,
      starts_at: `${MONDAY}T09:00:00.000Z`,
    });

    const res = await api<{ slots: { start: string }[] }>(
      "GET",
      `/api/companies/${companyId}/services/${serviceId}/availability?from=${MONDAY}&to=${MONDAY}`,
      owner.cookieHeader,
    );
    expect(res.json.slots.map((s) => s.start)).toEqual([`${MONDAY}T09:30:00.000Z`]);
  });

  it("consults the connected calendar and excludes a Google-busy slot, googleCalendarChecked: true", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Google Busy Avail Co");
    const serviceId = await createService(owner.cookieHeader, companyId, {
      name: "Consult",
      duration_minutes: 30,
    });
    await setBusinessHours(owner.cookieHeader, companyId, [
      { day_of_week: 1, start_time: "09:00", end_time: "10:00" },
    ]);

    await api("POST", `/api/companies/${companyId}/calendar/connect`, owner.cookieHeader, { code: "good-code" });
    // The connect route hard-codes google_calendar_id: "primary" -- point it
    // at the mock's "busy-calendar" scenario directly via the service
    // client, the same direct-row-write escape hatch other integration
    // tests use for state no HTTP route can set.
    await getTestServiceClient()
      .from("company_calendar_connections")
      .update({ google_calendar_id: "busy-calendar" })
      .eq("company_id", companyId);

    const res = await api<{ slots: unknown[]; googleCalendarChecked: boolean }>(
      "GET",
      `/api/companies/${companyId}/services/${serviceId}/availability?from=${MONDAY}&to=${MONDAY}`,
      owner.cookieHeader,
    );
    expect(res.status).toBe(200);
    expect(res.json.googleCalendarChecked).toBe(true);
    expect(res.json.slots).toEqual([]); // the mock reports the whole window busy
  });

  it("degrades gracefully (200, googleCalendarChecked: false) when the freeBusy call itself fails", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Google Failure Avail Co");
    const serviceId = await createService(owner.cookieHeader, companyId, {
      name: "Consult",
      duration_minutes: 30,
    });
    await setBusinessHours(owner.cookieHeader, companyId, [
      { day_of_week: 1, start_time: "09:00", end_time: "10:00" },
    ]);

    await api("POST", `/api/companies/${companyId}/calendar/connect`, owner.cookieHeader, { code: "good-code" });
    await getTestServiceClient()
      .from("company_calendar_connections")
      .update({ google_calendar_id: "trigger-freebusy-failure" })
      .eq("company_id", companyId);

    const res = await api<{ slots: { start: string }[]; googleCalendarChecked: boolean }>(
      "GET",
      `/api/companies/${companyId}/services/${serviceId}/availability?from=${MONDAY}&to=${MONDAY}`,
      owner.cookieHeader,
    );
    expect(res.status).toBe(200);
    expect(res.json.googleCalendarChecked).toBe(false);
    expect(res.json.slots.length).toBeGreaterThan(0); // still computed from business_hours alone
  });

  it("refreshes an expired access token before querying freeBusy, and persists the refreshed token", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Refresh Avail Co");
    const serviceId = await createService(owner.cookieHeader, companyId, {
      name: "Consult",
      duration_minutes: 30,
    });
    await setBusinessHours(owner.cookieHeader, companyId, [
      { day_of_week: 1, start_time: "09:00", end_time: "10:00" },
    ]);

    await api("POST", `/api/companies/${companyId}/calendar/connect`, owner.cookieHeader, { code: "good-code" });
    // Force the stored token into the past so load.ts's proactive refresh
    // path actually runs.
    await getTestServiceClient()
      .from("company_calendar_connections")
      .update({ token_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("company_id", companyId);

    const res = await api<{ googleCalendarChecked: boolean }>(
      "GET",
      `/api/companies/${companyId}/services/${serviceId}/availability?from=${MONDAY}&to=${MONDAY}`,
      owner.cookieHeader,
    );
    expect(res.status).toBe(200);
    // A successful freeBusy query only happens if the refresh (using the
    // mock OAuth server's default grant_type=refresh_token response)
    // actually succeeded first.
    expect(res.json.googleCalendarChecked).toBe(true);

    const row = await getTestServiceClient()
      .from("company_calendar_connections")
      .select("token_expires_at")
      .eq("company_id", companyId)
      .single();
    expect(new Date(row.data!.token_expires_at as string).getTime()).toBeGreaterThan(Date.now());
  });
});
