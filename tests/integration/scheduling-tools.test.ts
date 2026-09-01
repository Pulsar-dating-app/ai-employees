import { beforeAll, describe, expect, it, vi } from "vitest";
import { AgentEngine } from "@/lib/agent-engine";
import { listServicesTool } from "@/lib/agent-engine/tools/list-services";
import { findAvailableSlotsTool } from "@/lib/agent-engine/tools/find-available-slots";
import { bookAppointmentTool } from "@/lib/agent-engine/tools/book-appointment";
import { cancelAppointmentTool } from "@/lib/agent-engine/tools/cancel-appointment";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";

// Trello J3 -- Ana's scheduling tools. Like checkout-link.test.ts / the rest
// of the agent-engine suite, this imports the tool modules directly rather
// than going over HTTP: there is no route for a tool (D2 isn't built). Real
// local Postgres throughout -- the point is asserting the `appointments` row
// actually lands, with the right server-computed status, which a mock would
// never catch. No Google Calendar is connected in any of these, so the I3
// sync degrades to google_event_id staying null (never an error).

// A weekday far enough out that computeAvailableSlots never filters a slot
// as "in the past". Its day-of-week is computed rather than hard-coded so
// the business_hours row always matches.
const BOOKING_DATE = "2027-03-01";
const BOOKING_DOW = new Date(`${BOOKING_DATE}T12:00:00Z`).getUTCDay();

function textResponse(text: string) {
  return { output: [], output_text: text };
}

function functionCallResponse(callId: string, name: string, args: Record<string, unknown>) {
  return {
    output: [{ type: "function_call", call_id: callId, name, arguments: JSON.stringify(args) }],
    output_text: "",
  };
}

function fakeOpenAiConversationId() {
  return `conv_fake_${Math.random().toString(36).slice(2)}`;
}

type Seed = {
  companyId: string;
  agentId: string;
  customerId: string;
  conversationId: string;
};

async function seedConversation(owner: TestUser, companyName: string): Promise<Seed> {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
    name: companyName,
  });
  const companyId = created.json.company.id;

  // Deterministic timezone so BOOKING_DOW / business hours line up.
  await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, { timezone: "UTC" });

  const hired = await api<{ companyAgent: { agent_id: string } }>(
    "POST",
    `/api/companies/${companyId}/agents/ana`,
    owner.cookieHeader,
  );
  const agentId = hired.json.companyAgent.agent_id;

  const customerId = await createCustomer(owner, companyId, "Test Customer");

  const { data: conversation, error } = await owner.client
    .from("conversations")
    .insert({
      company_id: companyId,
      agent_id: agentId,
      customer_id: customerId,
      channel: "whatsapp",
      status: "active",
    })
    .select()
    .single();
  if (error) throw error;

  return { companyId, agentId, customerId, conversationId: conversation.id as string };
}

// No customers CRUD API exists yet -- insert via the signed-up user's own
// RLS-scoped client, the same escape hatch appointments.test.ts uses.
async function createCustomer(owner: TestUser, companyId: string, name: string): Promise<string> {
  const { data, error } = await owner.client
    .from("customers")
    .insert({ company_id: companyId, name, phone: "+15550000000", channel: "whatsapp" })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

async function createService(
  owner: TestUser,
  companyId: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await api<{ service: { id: string } }>(
    "POST",
    `/api/companies/${companyId}/services`,
    owner.cookieHeader,
    body,
  );
  return res.json.service.id;
}

async function setBusinessHours(owner: TestUser, companyId: string) {
  await api("PUT", `/api/companies/${companyId}/business-hours`, owner.cookieHeader, {
    businessHours: [{ day_of_week: BOOKING_DOW, start_time: "09:00", end_time: "17:00" }],
  });
}

function toolCtxFor(seed: Seed): ToolExecutionContext {
  return {
    companyId: seed.companyId,
    agentId: seed.agentId,
    conversationId: seed.conversationId,
    customerId: seed.customerId,
    supabase: getTestServiceClient(),
    openai: {} as ToolExecutionContext["openai"],
  };
}

let owner: TestUser;

beforeAll(async () => {
  owner = await signUpTestUser("owner");
});

describe("list_services", () => {
  it("returns only this company's active services, grounded in real rows", async () => {
    const seed = await seedConversation(owner, "List Services Co");
    await createService(owner, seed.companyId, {
      name: "Haircut",
      description: "A trim",
      duration_minutes: 30,
      // A number on the way in (H1's route rejects a string outright), a
      // string on the way back out — Postgres numeric always deserialises as
      // one. The two are not interchangeable; sending "50.00" here 400s.
      price: 50,
      currency: "BRL",
      category: "Hair",
    });
    const inactiveId = await createService(owner, seed.companyId, {
      name: "Discontinued",
      duration_minutes: 60,
    });
    await api("DELETE", `/api/companies/${seed.companyId}/services/${inactiveId}`, owner.cookieHeader);

    const result = (await listServicesTool.execute({}, toolCtxFor(seed))) as {
      id: string;
      name: string;
      durationMinutes: number;
      price: string | null;
    }[];

    expect(result).toHaveLength(1);
    // `price decimal(12,2)` reaches the model as a JSON number — PostgREST
    // emits `50.00` unquoted and JSON.parse hands back 50, so this is not
    // the string the dashboard's own `Number(price)` calls imply.
    expect(result[0]).toMatchObject({ name: "Haircut", durationMinutes: 30, price: 50 });
  });
});

describe("find_available_slots", () => {
  it("returns real slots from business hours, flagging that Google wasn't checked", async () => {
    const seed = await seedConversation(owner, "Slots Co");
    const serviceId = await createService(owner, seed.companyId, {
      name: "Consultation",
      duration_minutes: 30,
    });
    await setBusinessHours(owner, seed.companyId);

    const result = (await findAvailableSlotsTool.execute(
      { serviceId, from: BOOKING_DATE, to: BOOKING_DATE },
      toolCtxFor(seed),
    )) as {
      available: true;
      timezone: string;
      googleCalendarChecked: boolean;
      slots: { start: string; end: string }[];
    };

    expect(result.available).toBe(true);
    expect(result.timezone).toBe("UTC");
    expect(result.googleCalendarChecked).toBe(false);
    expect(result.slots[0]).toEqual({
      start: `${BOOKING_DATE}T09:00:00.000Z`,
      end: `${BOOKING_DATE}T09:30:00.000Z`,
    });
  });

  it("reports service_not_found for a service from another company", async () => {
    const seed = await seedConversation(owner, "Slots Tenant A");
    const other = await seedConversation(owner, "Slots Tenant B");
    const otherServiceId = await createService(owner, other.companyId, {
      name: "Other",
      duration_minutes: 30,
    });

    const result = await findAvailableSlotsTool.execute(
      { serviceId: otherServiceId, from: BOOKING_DATE, to: BOOKING_DATE },
      toolCtxFor(seed),
    );

    expect(result).toEqual({ available: false, reason: "service_not_found" });
  });
});

describe("book_appointment", () => {
  it("writes a confirmed appointment row when the company auto-confirms", async () => {
    const seed = await seedConversation(owner, "Auto Confirm Co");
    const serviceId = await createService(owner, seed.companyId, {
      name: "Massage",
      duration_minutes: 60,
      buffer_minutes: 15,
    });
    await setBusinessHours(owner, seed.companyId);

    const result = (await bookAppointmentTool.execute(
      { serviceId, startsAt: `${BOOKING_DATE}T09:00:00Z` },
      toolCtxFor(seed),
    )) as { booked: true; status: string; appointmentId: string; endsAt: string };

    expect(result.booked).toBe(true);
    expect(result.status).toBe("confirmed");

    const { data: row } = await getTestServiceClient()
      .from("appointments")
      .select("*")
      .eq("id", result.appointmentId)
      .single();

    expect(row).toMatchObject({
      company_id: seed.companyId,
      service_id: serviceId,
      customer_id: seed.customerId,
      conversation_id: seed.conversationId,
      agent_id: seed.agentId,
      status: "confirmed",
      google_event_id: null,
    });
    // ends_at bakes in duration + buffer (60 + 15).
    expect(row.ends_at).toBe(`${BOOKING_DATE}T10:15:00+00:00`);
  });

  it("writes a requested appointment when the company requires approval", async () => {
    const seed = await seedConversation(owner, "Approval Co");
    await api("PATCH", `/api/companies/${seed.companyId}`, owner.cookieHeader, {
      requires_appointment_approval: true,
    });
    const serviceId = await createService(owner, seed.companyId, {
      name: "Screening",
      duration_minutes: 30,
    });
    await setBusinessHours(owner, seed.companyId);

    const result = (await bookAppointmentTool.execute(
      { serviceId, startsAt: `${BOOKING_DATE}T10:00:00Z` },
      toolCtxFor(seed),
    )) as { booked: true; status: string };

    expect(result.status).toBe("requested");
  });

  it("refuses a slot that overlaps an existing live appointment", async () => {
    const seed = await seedConversation(owner, "Overlap Co");
    const serviceId = await createService(owner, seed.companyId, {
      name: "Session",
      duration_minutes: 30,
    });
    await setBusinessHours(owner, seed.companyId);
    const ctx = toolCtxFor(seed);

    const first = await bookAppointmentTool.execute(
      { serviceId, startsAt: `${BOOKING_DATE}T11:00:00Z` },
      ctx,
    );
    expect((first as { booked: boolean }).booked).toBe(true);

    const second = await bookAppointmentTool.execute(
      { serviceId, startsAt: `${BOOKING_DATE}T11:00:00Z` },
      ctx,
    );
    expect(second).toEqual({ booked: false, reason: "slot_unavailable" });
  });

  it("refuses a time outside business hours", async () => {
    const seed = await seedConversation(owner, "Closed Hours Co");
    const serviceId = await createService(owner, seed.companyId, {
      name: "Late Session",
      duration_minutes: 30,
    });
    await setBusinessHours(owner, seed.companyId); // 09:00-17:00

    const result = await bookAppointmentTool.execute(
      { serviceId, startsAt: `${BOOKING_DATE}T20:00:00Z` },
      toolCtxFor(seed),
    );

    expect(result).toEqual({ booked: false, reason: "outside_business_hours" });
  });

  it("cannot book a service belonging to another company", async () => {
    const seed = await seedConversation(owner, "Book Tenant A");
    const other = await seedConversation(owner, "Book Tenant B");
    const otherServiceId = await createService(owner, other.companyId, {
      name: "Other Service",
      duration_minutes: 30,
    });

    const result = await bookAppointmentTool.execute(
      { serviceId: otherServiceId, startsAt: `${BOOKING_DATE}T09:00:00Z` },
      toolCtxFor(seed),
    );

    expect(result).toEqual({ booked: false, reason: "service_not_found" });
  });
});

describe("intake questions (Trello K9)", () => {
  async function setIntakeFields(
    companyId: string,
    fields: { label: string; is_required: boolean }[],
  ) {
    await api("PUT", `/api/companies/${companyId}/intake-fields`, owner.cookieHeader, {
      intakeFields: fields,
    });
  }

  it("find_available_slots surfaces the configured questions (and [] when none)", async () => {
    const seed = await seedConversation(owner, "Intake Slots Co");
    const serviceId = await createService(owner, seed.companyId, {
      name: "Consult",
      duration_minutes: 30,
    });
    await setBusinessHours(owner, seed.companyId);

    const before = (await findAvailableSlotsTool.execute(
      { serviceId, from: BOOKING_DATE, to: BOOKING_DATE },
      toolCtxFor(seed),
    )) as { intakeQuestions: unknown[] };
    expect(before.intakeQuestions).toEqual([]);

    await setIntakeFields(seed.companyId, [
      { label: "Full name", is_required: true },
      { label: "Age", is_required: false },
    ]);

    const after = (await findAvailableSlotsTool.execute(
      { serviceId, from: BOOKING_DATE, to: BOOKING_DATE },
      toolCtxFor(seed),
    )) as { intakeQuestions: { label: string; required: boolean }[] };
    expect(after.intakeQuestions).toEqual([
      { label: "Full name", required: true },
      { label: "Age", required: false },
    ]);
  });

  it("book_appointment refuses until every required answer is supplied", async () => {
    const seed = await seedConversation(owner, "Intake Required Co");
    const serviceId = await createService(owner, seed.companyId, {
      name: "Screening",
      duration_minutes: 30,
    });
    await setBusinessHours(owner, seed.companyId);
    await setIntakeFields(seed.companyId, [
      { label: "Full name", is_required: true },
      { label: "CPF", is_required: true },
      { label: "Notes", is_required: false },
    ]);
    const ctx = toolCtxFor(seed);

    const missing = await bookAppointmentTool.execute(
      { serviceId, startsAt: `${BOOKING_DATE}T09:00:00Z`, intakeAnswers: { "Full name": "Ana Souza" } },
      ctx,
    );
    expect(missing).toEqual({ booked: false, reason: "missing_intake_answers", missingRequired: ["CPF"] });

    // No row was written.
    const { data: none } = await getTestServiceClient()
      .from("appointments")
      .select("id")
      .eq("conversation_id", seed.conversationId);
    expect(none).toHaveLength(0);

    // Case-insensitive key match; optional "Notes" left blank is fine.
    const booked = (await bookAppointmentTool.execute(
      {
        serviceId,
        startsAt: `${BOOKING_DATE}T09:00:00Z`,
        intakeAnswers: { "full name": "Ana Souza", cpf: "123.456.789-00" },
      },
      ctx,
    )) as { booked: true; appointmentId: string };
    expect(booked.booked).toBe(true);

    const { data: row } = await getTestServiceClient()
      .from("appointments")
      .select("intake_answers")
      .eq("id", booked.appointmentId)
      .single();
    // Stored under the canonical labels; the unanswered optional is absent.
    expect(row!.intake_answers).toEqual({ "Full name": "Ana Souza", CPF: "123.456.789-00" });
  });

  it("stores an answered optional question and still books when it's blank", async () => {
    const seed = await seedConversation(owner, "Intake Optional Co");
    const serviceId = await createService(owner, seed.companyId, {
      name: "Visit",
      duration_minutes: 30,
    });
    await setBusinessHours(owner, seed.companyId);
    await setIntakeFields(seed.companyId, [{ label: "Referral source", is_required: false }]);

    const answered = (await bookAppointmentTool.execute(
      {
        serviceId,
        startsAt: `${BOOKING_DATE}T10:00:00Z`,
        intakeAnswers: { "Referral source": "Instagram" },
      },
      toolCtxFor(seed),
    )) as { booked: true; appointmentId: string };
    expect(answered.booked).toBe(true);

    const skipped = (await bookAppointmentTool.execute(
      { serviceId, startsAt: `${BOOKING_DATE}T11:00:00Z` },
      toolCtxFor(seed),
    )) as { booked: true; appointmentId: string };
    expect(skipped.booked).toBe(true);

    const { data: rows } = await getTestServiceClient()
      .from("appointments")
      .select("id, intake_answers")
      .in("id", [answered.appointmentId, skipped.appointmentId]);
    const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r.intake_answers]));
    expect(byId[answered.appointmentId]).toEqual({ "Referral source": "Instagram" });
    expect(byId[skipped.appointmentId]).toEqual({});
  });
});

describe("cancel_appointment", () => {
  it("soft-cancels this customer's appointment and is idempotent", async () => {
    const seed = await seedConversation(owner, "Cancel Co");
    const serviceId = await createService(owner, seed.companyId, {
      name: "Cancellable",
      duration_minutes: 30,
    });
    await setBusinessHours(owner, seed.companyId);
    const ctx = toolCtxFor(seed);

    const booked = (await bookAppointmentTool.execute(
      { serviceId, startsAt: `${BOOKING_DATE}T12:00:00Z` },
      ctx,
    )) as { appointmentId: string };

    const first = await cancelAppointmentTool.execute(
      { appointmentId: booked.appointmentId, reason: "changed my mind" },
      ctx,
    );
    expect(first).toEqual({
      cancelled: true,
      appointmentId: booked.appointmentId,
      alreadyCancelled: false,
    });

    const { data: row } = await getTestServiceClient()
      .from("appointments")
      .select("status, cancellation_reason")
      .eq("id", booked.appointmentId)
      .single();
    expect(row).toMatchObject({ status: "cancelled", cancellation_reason: "changed my mind" });

    const second = await cancelAppointmentTool.execute(
      { appointmentId: booked.appointmentId },
      ctx,
    );
    expect(second).toEqual({
      cancelled: true,
      appointmentId: booked.appointmentId,
      alreadyCancelled: true,
    });
  });

  it("will not cancel an appointment that belongs to a different customer", async () => {
    const seed = await seedConversation(owner, "Cancel Scoping Co");
    const serviceId = await createService(owner, seed.companyId, {
      name: "Scoped",
      duration_minutes: 30,
    });
    await setBusinessHours(owner, seed.companyId);

    const booked = (await bookAppointmentTool.execute(
      { serviceId, startsAt: `${BOOKING_DATE}T13:00:00Z` },
      toolCtxFor(seed),
    )) as { appointmentId: string };

    // A second customer in the same company, talking to Ana in their own
    // conversation, must not be able to cancel the first customer's booking.
    const intruderCustomerId = await createCustomer(owner, seed.companyId, "Intruder");
    const intruderCtx: ToolExecutionContext = {
      ...toolCtxFor(seed),
      customerId: intruderCustomerId,
    };

    const result = await cancelAppointmentTool.execute(
      { appointmentId: booked.appointmentId },
      intruderCtx,
    );
    expect(result).toEqual({ cancelled: false, reason: "not_found" });

    const { data: row } = await getTestServiceClient()
      .from("appointments")
      .select("status")
      .eq("id", booked.appointmentId)
      .single();
    expect(row!.status).not.toBe("cancelled");
  });
});

describe("through a full AgentEngine.run", () => {
  it("lets Ana find a slot and book it, and the row lands", async () => {
    const seed = await seedConversation(owner, "Ana Round Trip Co");
    const serviceId = await createService(owner, seed.companyId, {
      name: "Intro Call",
      duration_minutes: 30,
    });
    await setBusinessHours(owner, seed.companyId);

    const responsesCreate = vi
      .fn()
      .mockResolvedValueOnce(
        functionCallResponse("call_1", "find_available_slots", {
          serviceId,
          from: BOOKING_DATE,
          to: BOOKING_DATE,
        }),
      )
      .mockResolvedValueOnce(
        functionCallResponse("call_2", "book_appointment", {
          serviceId,
          startsAt: `${BOOKING_DATE}T09:00:00Z`,
        }),
      )
      // No digits in the final text: keeps the C7 grounding check from
      // having anything to look at, so it never triggers a retry that would
      // need a fourth mocked response.
      .mockResolvedValueOnce(textResponse("Perfect, you're all set — see you then 😊"));
    const openai = {
      conversations: { create: vi.fn().mockResolvedValue({ id: fakeOpenAiConversationId() }) },
      responses: { create: responsesCreate },
    } as never;

    const result = await AgentEngine.run(
      {
        companyId: seed.companyId,
        conversationId: seed.conversationId,
        message: "can I come in on the 1st at 9?",
      },
      { supabase: getTestServiceClient(), openai },
    );

    // Must match the third mocked response verbatim — the digit-free wording
    // above is deliberate (it keeps C7's grounding check quiet), and this
    // assertion was left behind on the older "9am" text when it changed.
    expect(result.responseText).toBe("Perfect, you're all set — see you then 😊");

    const bookOutput = JSON.parse(responsesCreate.mock.calls[2][0].input[0].output);
    expect(bookOutput.booked).toBe(true);
    expect(bookOutput.status).toBe("confirmed");

    const { data: rows } = await getTestServiceClient()
      .from("appointments")
      .select("status, starts_at")
      .eq("conversation_id", seed.conversationId);
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({
      status: "confirmed",
      starts_at: `${BOOKING_DATE}T09:00:00+00:00`,
    });
  });
});
