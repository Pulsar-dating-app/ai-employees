import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { seedActivePlan } from "./helpers/billing";
import { AppointmentRepository } from "@/lib/appointments/repository";
import { getBusinessHoursTool } from "@/lib/agent-engine/tools/get-business-hours";
import { addToWaitlistTool } from "@/lib/agent-engine/tools/add-to-waitlist";

// Found by hand-testing the first session with a business closed on
// Thursdays: the agent said "no availability tomorrow" and offered the
// waitlist for it. Both are wrong -- a closed day is not a full day, and
// nothing frees up on a day nobody works.
describe("A day the business does not open", () => {
  // Mon/Tue/Wed/Fri open, Thursday deliberately missing.
  const OPEN_DAYS = [1, 2, 3, 5];

  async function shopClosedOnThursdays(owner: TestUser) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
      name: `Closed Thu Co ${randomUUID().slice(0, 8)}`,
    });
    const companyId = created.json.company.id;
    await seedActivePlan(companyId);

    await api("PUT", `/api/companies/${companyId}/business-hours`, owner.cookieHeader, {
      businessHours: OPEN_DAYS.map((day) => ({
        day_of_week: day,
        start_time: "09:00",
        end_time: "14:00",
      })),
    });

    const service = await api<{ service: { id: string } }>(
      "POST",
      `/api/companies/${companyId}/services`,
      owner.cookieHeader,
      { name: "Corte feminino", duration_minutes: 60 },
    );

    return { companyId, serviceId: service.json.service.id };
  }

  // A Thursday and the Friday after it, far enough out that lead time and
  // "already past" can never be what makes the day empty.
  const THURSDAY = "2027-03-04";
  const FRIDAY = "2027-03-05";

  it("reports the closed day instead of just returning nothing", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, serviceId } = await shopClosedOnThursdays(owner);

    const result = await AppointmentRepository.findAvailableSlots(
      { companyId, serviceId, from: THURSDAY, to: THURSDAY },
      getTestServiceClient(),
    );
    if (!result.available) throw new Error("the service should exist");

    expect(result.slots).toHaveLength(0);
    // Without this the agent cannot tell "closed" from "fully booked".
    expect(result.closedDates).toContain(THURSDAY);
  });

  it("does not call an open day closed", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, serviceId } = await shopClosedOnThursdays(owner);

    const result = await AppointmentRepository.findAvailableSlots(
      { companyId, serviceId, from: FRIDAY, to: FRIDAY },
      getTestServiceClient(),
    );
    if (!result.available) throw new Error("the service should exist");

    expect(result.closedDates).not.toContain(FRIDAY);
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it("separates the two reasons across a window", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, serviceId } = await shopClosedOnThursdays(owner);

    const result = await AppointmentRepository.findAvailableSlots(
      { companyId, serviceId, from: THURSDAY, to: FRIDAY },
      getTestServiceClient(),
    );
    if (!result.available) throw new Error("the service should exist");

    expect(result.closedDates).toEqual([THURSDAY]);
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it("refuses the waitlist for a range the business never opens in", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, serviceId } = await shopClosedOnThursdays(owner);
    const svc = getTestServiceClient();

    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: companyId, channel: "web_chat", web_chat_session_id: randomUUID() })
      .select("id")
      .single();

    const result = (await addToWaitlistTool.execute(
      { serviceId, from: THURSDAY, to: THURSDAY },
      {
        companyId,
        agentId: null,
        conversationId: null,
        customerId: (customer as { id: string }).id,
        supabase: svc,
        openai: {},
      } as never,
    )) as { added: boolean; reason?: string };

    expect(result.added).toBe(false);
    expect(result.reason).toBe("closed");

    const { count } = await svc
      .from("appointment_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    expect(count ?? 0).toBe(0);
  });

  it("still takes a waitlist entry when the range contains an open day", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, serviceId } = await shopClosedOnThursdays(owner);
    const svc = getTestServiceClient();

    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: companyId, channel: "web_chat", web_chat_session_id: randomUUID() })
      .select("id")
      .single();

    const result = (await addToWaitlistTool.execute(
      { serviceId, from: THURSDAY, to: FRIDAY, email: "cliente@example.com" },
      {
        companyId,
        agentId: null,
        conversationId: null,
        customerId: (customer as { id: string }).id,
        supabase: svc,
        openai: {},
      } as never,
    )) as { added: boolean };

    expect(result.added).not.toBe(false);
  });

  // The other half of the same report: she said she had no opening hours on
  // file for a business that had just configured them, because no tool could
  // read them.
  it("can answer what time the business opens", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId } = await shopClosedOnThursdays(owner);

    const result = (await getBusinessHoursTool.execute({}, {
      companyId,
      supabase: getTestServiceClient(),
    } as never)) as { days: { dayOfWeek: number; opensAt: string; closesAt: string }[] };

    expect(result.days.map((d) => d.dayOfWeek)).toEqual(OPEN_DAYS);
    expect(result.days[0].opensAt).toBe("09:00");
    expect(result.days[0].closesAt).toBe("14:00");
  });
});
