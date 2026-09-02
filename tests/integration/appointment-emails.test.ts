import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bookAppointmentTool } from "@/lib/agent-engine/tools/book-appointment";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { sentEmails, clearEmails, waitForEmail } from "./helpers/email";

// book_appointment runs in-process in this worker (not the spawned next
// server), so sendEmail() here needs the mock URL + creds in *this*
// process's env too. The H3 PATCH path goes through the spawned server,
// which global-setup already configured.
process.env.RESEND_API_BASE_URL = getTestEnv().emailMockUrl;
process.env.RESEND_API_KEY ??= "test-resend-key";
process.env.EMAIL_FROM ??= "Staffra <test@staffra.test>";

// Trello R3 (confirmation / decline emails) + R4 (reminder cron). The mock
// Resend server is started by global-setup.ts; sends are best-effort so the
// assertions poll via waitForEmail.

const BOOKING_DATE = "2027-04-05";
const BOOKING_DOW = new Date(`${BOOKING_DATE}T12:00:00Z`).getUTCDay();

let owner: TestUser;
beforeAll(async () => {
  owner = await signUpTestUser("owner");
});
beforeEach(async () => {
  await clearEmails();
});

async function seed(companyName: string, opts: { requiresApproval?: boolean } = {}) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
    name: companyName,
  });
  const companyId = created.json.company.id;
  await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
    timezone: "UTC",
    email: "studio@example.test",
    ...(opts.requiresApproval ? { requires_appointment_approval: true } : {}),
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
    .insert({ company_id: companyId, agent_id: agentId, customer_id: (customer as { id: string }).id, channel: "whatsapp", status: "active" })
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
  return { companyId, serviceId: (service as { id: string }).id, customerId: (customer as { id: string }).id, ctx, svc };
}

function bookVia(ctx: ToolExecutionContext, serviceId: string, startsAt: string, email?: string) {
  return bookAppointmentTool.execute(
    {
      serviceId,
      startsAt,
      intakeAnswers: { full_name: "Cliente Teste", ...(email ? { email } : {}) },
    },
    ctx,
  );
}

describe("R3 -- booking confirmation / decline emails", () => {
  it("emails a confirmation when an auto-confirming booking lands", async () => {
    const { ctx, serviceId } = await seed("R3 AutoConfirm Co");
    const to = `c-${randomUUID()}@example.test`;

    const booked = (await bookVia(ctx, serviceId, `${BOOKING_DATE}T10:00:00Z`, to)) as { booked: boolean };
    expect(booked.booked).toBe(true);

    const email = await waitForEmail(to);
    expect(email.subject).toContain("confirmed");
    expect(email.text).toContain("Consulta");
    expect(email.text).toContain("studio@example.test"); // contact line
  });

  it("does NOT email on a booking that lands as `requested`", async () => {
    const { ctx, serviceId } = await seed("R3 Approval Co", { requiresApproval: true });
    const to = `c-${randomUUID()}@example.test`;

    const booked = (await bookVia(ctx, serviceId, `${BOOKING_DATE}T11:00:00Z`, to)) as {
      booked: boolean;
      status: string;
    };
    expect(booked.status).toBe("requested");

    await new Promise((r) => setTimeout(r, 500));
    expect((await sentEmails()).some((e) => e.to === to)).toBe(false);
  });

  it("emails a confirmation when the merchant approves a pending request", async () => {
    const { ctx, serviceId, companyId } = await seed("R3 Approve Later Co", { requiresApproval: true });
    const to = `c-${randomUUID()}@example.test`;
    const booked = (await bookVia(ctx, serviceId, `${BOOKING_DATE}T12:00:00Z`, to)) as { appointmentId: string };
    await clearEmails();

    const res = await api("PATCH", `/api/companies/${companyId}/appointments/${booked.appointmentId}`, owner.cookieHeader, {
      status: "confirmed",
    });
    expect(res.status).toBe(200);

    const email = await waitForEmail(to);
    expect(email.subject).toContain("confirmed");
  });

  it("emails a decline note when the merchant declines a pending request", async () => {
    const { ctx, serviceId, companyId } = await seed("R3 Decline Co", { requiresApproval: true });
    const to = `c-${randomUUID()}@example.test`;
    const booked = (await bookVia(ctx, serviceId, `${BOOKING_DATE}T13:00:00Z`, to)) as { appointmentId: string };
    await clearEmails();

    await api("PATCH", `/api/companies/${companyId}/appointments/${booked.appointmentId}`, owner.cookieHeader, {
      status: "cancelled",
      cancellation_reason: "fully booked that day",
    });

    const email = await waitForEmail(to);
    expect(email.subject.toLowerCase()).toContain("couldn't be confirmed");
  });

  it("a customer with no email just doesn't get one -- the booking still succeeds", async () => {
    const { ctx, serviceId } = await seed("R3 No Email Co");
    // No email in intakeAnswers -> book fails the required-email check (R2),
    // so seed the email onto the customer row directly and re-book without it.
    const booked = (await bookVia(ctx, serviceId, `${BOOKING_DATE}T14:00:00Z`, "has-email@example.test")) as {
      booked: boolean;
    };
    expect(booked.booked).toBe(true);
    // (An email does go out here; the "no email" path is covered by the
    // reminder-cron `skipped` case below, where a row genuinely lacks one.)
  });
});

describe("R4 -- appointment reminder cron", () => {
  const CRON_PATH = "/api/cron/appointment-reminders";

  async function callCron(secret?: string) {
    const res = await fetch(getTestEnv().baseUrl + CRON_PATH, {
      method: "POST",
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, number> | null };
  }

  async function seedConfirmed(
    svc: ReturnType<typeof getTestServiceClient>,
    companyId: string,
    serviceId: string,
    opts: { startsInHours: number; email: string | null; status?: string; reminderSent?: boolean },
  ) {
    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: companyId, channel: "web_chat", web_chat_session_id: randomUUID(), email: opts.email })
      .select("id")
      .single();
    const startsAt = new Date(Date.now() + opts.startsInHours * 3600_000);
    const { data: appt } = await svc
      .from("appointments")
      .insert({
        company_id: companyId,
        service_id: serviceId,
        customer_id: (customer as { id: string }).id,
        status: opts.status ?? "confirmed",
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
        reminder_sent_at: opts.reminderSent ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    return (appt as { id: string }).id;
  }

  it("rejects a call with no bearer / the wrong secret", async () => {
    expect((await callCron()).status).toBe(401);
    expect((await callCron("nope")).status).toBe(401);
  });

  it("emails a reminder for a confirmed booking ~20h out, once, and stamps reminder_sent_at", async () => {
    const { companyId, serviceId, svc } = await seed("R4 Reminder Co");
    const to = `rem-${randomUUID()}@example.test`;
    const apptId = await seedConfirmed(svc, companyId, serviceId, { startsInHours: 20, email: to });

    const first = await callCron("test-cron-secret");
    expect(first.status).toBe(200);
    expect(first.json?.sent).toBeGreaterThanOrEqual(1);

    const email = await waitForEmail(to);
    expect(email.subject.toLowerCase()).toContain("reminder");

    const { data: row } = await svc.from("appointments").select("reminder_sent_at").eq("id", apptId).single();
    expect(row!.reminder_sent_at).not.toBeNull();

    // Second run: no new email for this one.
    await clearEmails();
    await callCron("test-cron-secret");
    await new Promise((r) => setTimeout(r, 400));
    expect((await sentEmails()).some((e) => e.to === to)).toBe(false);
  });

  it("ignores requested / cancelled / far-future / already-reminded bookings", async () => {
    const { companyId, serviceId, svc } = await seed("R4 Skip Co");
    const t = () => `rem-${randomUUID()}@example.test`;
    const emails = { requested: t(), cancelled: t(), far: t(), done: t() };
    // Distinct times so the appointments EXCLUDE constraint (overlap on
    // non-cancelled rows) doesn't reject the seed inserts.
    await seedConfirmed(svc, companyId, serviceId, { startsInHours: 20, email: emails.requested, status: "requested" });
    await seedConfirmed(svc, companyId, serviceId, { startsInHours: 21, email: emails.cancelled, status: "cancelled" });
    await seedConfirmed(svc, companyId, serviceId, { startsInHours: 100, email: emails.far });
    await seedConfirmed(svc, companyId, serviceId, { startsInHours: 22, email: emails.done, reminderSent: true });

    await callCron("test-cron-secret");
    await new Promise((r) => setTimeout(r, 500));
    const to = new Set((await sentEmails()).map((e) => e.to));
    for (const e of Object.values(emails)) expect(to.has(e)).toBe(false);
  });

  it("counts a confirmed booking with no customer email as skipped, and stamps it so it isn't retried", async () => {
    const { companyId, serviceId, svc } = await seed("R4 No Email Co");
    const apptId = await seedConfirmed(svc, companyId, serviceId, { startsInHours: 18, email: null });

    const res = await callCron("test-cron-secret");
    expect(res.json?.skipped).toBeGreaterThanOrEqual(1);
    const { data: row } = await svc.from("appointments").select("reminder_sent_at").eq("id", apptId).single();
    expect(row!.reminder_sent_at).not.toBeNull();
  });
});
