import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bookAppointmentTool } from "@/lib/agent-engine/tools/book-appointment";
import { cancelAppointmentTool } from "@/lib/agent-engine/tools/cancel-appointment";
import { addToWaitlistTool } from "@/lib/agent-engine/tools/add-to-waitlist";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { sentEmails, clearEmails, waitForEmail } from "./helpers/email";

// Trello R5 -- the waitlist. add_to_waitlist runs in-process in this worker,
// so sendEmail() here needs the mock Resend URL + creds in this process too
// (same note as appointment-emails.test.ts). The H3 DELETE path goes through
// the spawned server, already configured by global-setup.
process.env.RESEND_API_BASE_URL = getTestEnv().emailMockUrl;
process.env.RESEND_API_KEY ??= "test-resend-key";
process.env.EMAIL_FROM ??= "Staffra <test@staffra.test>";

// A far-future weekday so a booking never trips the past-slot filter; DOW
// computed so the business_hours row lines up.
const BOOKING_DATE = "2027-05-03";
const BOOKING_DOW = new Date(`${BOOKING_DATE}T12:00:00Z`).getUTCDay();

let owner: TestUser;
beforeAll(async () => {
  owner = await signUpTestUser("owner");
});
beforeEach(async () => {
  await clearEmails();
});

type Seed = {
  companyId: string;
  serviceId: string;
  agentId: string;
  customerId: string;
  conversationId: string;
  ctx: ToolExecutionContext;
};

async function seed(companyName: string): Promise<Seed> {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
    name: companyName,
  });
  const companyId = created.json.company.id;
  await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
    timezone: "UTC",
    email: "studio@example.test",
  });
  const hired = await api<{ companyAgent: { agent_id: string } }>(
    "POST",
    `/api/companies/${companyId}/agents/ana`,
    owner.cookieHeader,
  );
  const agentId = hired.json.companyAgent.agent_id;

  const svc = getTestServiceClient();
  const { data: service } = await svc
    .from("services")
    .insert({ company_id: companyId, name: "Consulta", duration_minutes: 30 })
    .select("id")
    .single();
  await api("PUT", `/api/companies/${companyId}/business-hours`, owner.cookieHeader, {
    businessHours: [{ day_of_week: BOOKING_DOW, start_time: "09:00", end_time: "17:00" }],
  });

  const { data: customer } = await svc
    .from("customers")
    .insert({ company_id: companyId, channel: "web_chat", web_chat_session_id: randomUUID() })
    .select("id")
    .single();
  const { data: conversation } = await svc
    .from("conversations")
    .insert({
      company_id: companyId,
      agent_id: agentId,
      customer_id: (customer as { id: string }).id,
      channel: "whatsapp",
      status: "active",
    })
    .select("id")
    .single();

  const ctx: ToolExecutionContext = {
    companyId,
    agentId,
    conversationId: (conversation as { id: string }).id,
    customerId: (customer as { id: string }).id,
    supabase: svc,
    openai: {} as ToolExecutionContext["openai"],
  };
  return {
    companyId,
    serviceId: (service as { id: string }).id,
    agentId,
    customerId: (customer as { id: string }).id,
    conversationId: (conversation as { id: string }).id,
    ctx,
  };
}

function book(ctx: ToolExecutionContext, serviceId: string, startsAt: string, email: string) {
  return bookAppointmentTool.execute(
    { serviceId, startsAt, intakeAnswers: { email, full_name: "Cliente Teste" } },
    ctx,
  );
}

// A fresh customer + conversation under the same company, so booker and each
// waiter are genuinely different people (they'd otherwise share one customer
// row and one email).
async function newParty(s: Seed): Promise<ToolExecutionContext> {
  const svc = getTestServiceClient();
  const { data: customer } = await svc
    .from("customers")
    .insert({ company_id: s.companyId, channel: "web_chat", web_chat_session_id: randomUUID() })
    .select("id")
    .single();
  const { data: conversation } = await svc
    .from("conversations")
    .insert({
      company_id: s.companyId,
      agent_id: s.agentId,
      customer_id: (customer as { id: string }).id,
      channel: "whatsapp",
      status: "active",
    })
    .select("id")
    .single();
  return {
    ...s.ctx,
    customerId: (customer as { id: string }).id,
    conversationId: (conversation as { id: string }).id,
  };
}

describe("add_to_waitlist", () => {
  it("adds an entry, fills the customer's blank email, and is idempotent per window", async () => {
    const s = await seed("Waitlist Add Co");
    const svc = getTestServiceClient();
    const email = `w-${randomUUID()}@example.test`;

    const first = (await addToWaitlistTool.execute(
      { serviceId: s.serviceId, from: "2027-05-01", to: "2027-05-07", email },
      s.ctx,
    )) as { added: true; alreadyWaiting: boolean; waitlistId: string };
    expect(first).toMatchObject({ added: true, alreadyWaiting: false });

    const { data: rows } = await svc
      .from("appointment_waitlist")
      .select("customer_id, service_id, desired_from, desired_to, notified_at")
      .eq("company_id", s.companyId);
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({
      customer_id: s.customerId,
      service_id: s.serviceId,
      desired_from: "2027-05-01",
      desired_to: "2027-05-07",
      notified_at: null,
    });

    const { data: customer } = await svc
      .from("customers")
      .select("email")
      .eq("id", s.customerId)
      .single();
    expect(customer!.email).toBe(email);

    // Same window again -> keeps the original spot, no duplicate row.
    const again = await addToWaitlistTool.execute(
      { serviceId: s.serviceId, from: "2027-05-01", to: "2027-05-07" },
      s.ctx,
    );
    expect(again).toMatchObject({ added: true, alreadyWaiting: true });
    const { data: after } = await svc
      .from("appointment_waitlist")
      .select("id")
      .eq("company_id", s.companyId);
    expect(after).toHaveLength(1);
  });

  it("refuses without any email to notify", async () => {
    const s = await seed("Waitlist No Email Co");
    const result = await addToWaitlistTool.execute(
      { serviceId: s.serviceId, from: "2027-05-01", to: "2027-05-07" },
      s.ctx,
    );
    expect(result).toEqual({ added: false, reason: "email_required" });
  });

  it("rejects a malformed email and a backwards range", async () => {
    const s = await seed("Waitlist Bad Input Co");
    expect(
      await addToWaitlistTool.execute(
        { serviceId: s.serviceId, from: "2027-05-01", to: "2027-05-07", email: "nope" },
        s.ctx,
      ),
    ).toEqual({ added: false, reason: "invalid_email" });
    expect(
      await addToWaitlistTool.execute(
        { serviceId: s.serviceId, from: "2027-05-07", to: "2027-05-01", email: "a@b.co" },
        s.ctx,
      ),
    ).toEqual({ added: false, reason: "invalid_range" });
  });

  it("reports service_not_found for another company's service", async () => {
    const s = await seed("Waitlist Tenant A");
    const other = await seed("Waitlist Tenant B");
    const result = await addToWaitlistTool.execute(
      { serviceId: other.serviceId, from: "2027-05-01", to: "2027-05-07", email: "a@b.co" },
      s.ctx,
    );
    expect(result).toEqual({ added: false, reason: "service_not_found" });
  });
});

describe("a cancelled appointment notifies the waitlist", () => {
  it("emails the oldest waiter whose window covers the freed slot, and stamps notified_at (Ana's cancel)", async () => {
    const s = await seed("Waitlist Cancel Co");
    const svc = getTestServiceClient();

    const booked = (await book(s.ctx, s.serviceId, `${BOOKING_DATE}T09:00:00Z`, `booker-${randomUUID()}@example.test`)) as {
      booked: true;
      appointmentId: string;
    };
    expect(booked.booked).toBe(true);

    // Two separate waiters, both covering 2027-05-03; the first to join wins.
    const firstEmail = `first-${randomUUID()}@example.test`;
    const secondEmail = `second-${randomUUID()}@example.test`;
    await addToWaitlistTool.execute(
      { serviceId: s.serviceId, from: "2027-05-01", to: "2027-05-05", email: firstEmail },
      await newParty(s),
    );
    await addToWaitlistTool.execute(
      { serviceId: s.serviceId, from: "2027-05-03", to: "2027-05-03", email: secondEmail },
      await newParty(s),
    );
    await clearEmails();

    const cancelled = await cancelAppointmentTool.execute({ appointmentId: booked.appointmentId }, s.ctx);
    expect(cancelled).toMatchObject({ cancelled: true });

    const mail = await waitForEmail(firstEmail);
    expect(mail.subject).toContain("Consulta");
    expect(mail.text.toLowerCase()).toContain("opened up");

    // The second waiter is untouched.
    await new Promise((r) => setTimeout(r, 300));
    expect((await sentEmails()).some((e) => e.to === secondEmail)).toBe(false);

    const { data: waiters } = await svc
      .from("appointment_waitlist")
      .select("desired_from, notified_at")
      .eq("company_id", s.companyId)
      .order("desired_from", { ascending: true });
    expect(waiters![0].notified_at).not.toBeNull(); // 2027-05-01..05 entry, notified
    expect(waiters![1].notified_at).toBeNull(); // 2027-05-03 entry, still waiting
  });

  it("does not email a waiter whose window misses the freed date", async () => {
    const s = await seed("Waitlist Miss Co");
    const booked = (await book(s.ctx, s.serviceId, `${BOOKING_DATE}T10:00:00Z`, `booker-${randomUUID()}@example.test`)) as {
      appointmentId: string;
    };

    const waiter = `miss-${randomUUID()}@example.test`;
    await addToWaitlistTool.execute(
      { serviceId: s.serviceId, from: "2027-06-01", to: "2027-06-07", email: waiter },
      await newParty(s),
    );
    await clearEmails();

    await cancelAppointmentTool.execute({ appointmentId: booked.appointmentId }, s.ctx);

    await new Promise((r) => setTimeout(r, 400));
    expect((await sentEmails()).some((e) => e.to === waiter)).toBe(false);
  });

  it("notifies the waitlist when the merchant cancels from the dashboard (H3 DELETE)", async () => {
    const s = await seed("Waitlist Merchant Cancel Co");
    const booked = (await book(s.ctx, s.serviceId, `${BOOKING_DATE}T11:00:00Z`, `booker-${randomUUID()}@example.test`)) as {
      appointmentId: string;
    };

    const waiter = `merch-${randomUUID()}@example.test`;
    await addToWaitlistTool.execute(
      { serviceId: s.serviceId, from: "2027-05-02", to: "2027-05-04", email: waiter },
      await newParty(s),
    );
    await clearEmails();

    const res = await api(
      "DELETE",
      `/api/companies/${s.companyId}/appointments/${booked.appointmentId}`,
      owner.cookieHeader,
    );
    expect(res.status).toBe(200);

    const mail = await waitForEmail(waiter);
    expect(mail.text.toLowerCase()).toContain("first come, first served");
  });
});
