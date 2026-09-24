import { beforeEach, describe, expect, it } from "vitest";
import { listServicesTool } from "@/lib/agent-engine/tools/list-services";
import { findAvailableSlotsTool } from "@/lib/agent-engine/tools/find-available-slots";
import { bookAppointmentTool } from "@/lib/agent-engine/tools/book-appointment";
import { rescheduleAppointmentTool } from "@/lib/agent-engine/tools/reschedule-appointment";
import { listMyAppointmentsTool } from "@/lib/agent-engine/tools/list-my-appointments";
import type { ToolExecutionContext } from "@/lib/agent-engine/tools/types";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { seedActivePlan } from "./helpers/billing";
import { calendarPath, defaultProfessionalId } from "./helpers/professionals";
import { capturedCalendarEvent } from "./helpers/google-calendar-events";

// 2026-09-24 -- multiple schedules per company, one per professional (a
// barbershop's barbers, a clinic's partners). Real local Postgres and the
// real Next routes throughout; Ana's tools are called in-process like
// scheduling-tools.test.ts does.

const DATE = "2027-03-01"; // a Monday, far enough out never to be "past"
const DOW = new Date(`${DATE}T12:00:00Z`).getUTCDay();
const SATURDAY = "2027-03-06";
const SLOT = `${DATE}T10:00:00.000Z`;
const INTAKE = { email: "customer@test.example", full_name: "Test Customer" };

type Seed = {
  companyId: string;
  agentId: string;
  customerId: string;
  conversationId: string;
  serviceId: string;
  first: string; // the seeded professional
};

let owner: TestUser;

beforeEach(async () => {
  owner = await signUpTestUser("owner");
});

async function seed(name: string): Promise<Seed> {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, { name });
  const companyId = created.json.company.id;
  await seedActivePlan(companyId);
  await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, { timezone: "UTC" });
  const hired = await api<{ companyAgent: { agent_id: string } }>(
    "POST",
    `/api/companies/${companyId}/agents/ana`,
    owner.cookieHeader,
  );
  await api("PUT", `/api/companies/${companyId}/business-hours`, owner.cookieHeader, {
    businessHours: [{ day_of_week: DOW, start_time: "09:00", end_time: "12:00" }],
  });
  const service = await api<{ service: { id: string } }>("POST", `/api/companies/${companyId}/services`, owner.cookieHeader, {
    name: "Corte",
    duration_minutes: 30,
  });
  const customerId = await createCustomer(companyId);
  const { data: conversation, error } = await owner.client
    .from("conversations")
    .insert({ company_id: companyId, agent_id: hired.json.companyAgent.agent_id, customer_id: customerId, channel: "whatsapp", status: "active" })
    .select("id")
    .single();
  if (error) throw error;
  return {
    companyId,
    agentId: hired.json.companyAgent.agent_id,
    customerId,
    conversationId: conversation.id as string,
    serviceId: service.json.service.id,
    first: await defaultProfessionalId(companyId),
  };
}

async function createCustomer(companyId: string): Promise<string> {
  const phone = `+1555${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}`;
  const { data, error } = await owner.client
    .from("customers")
    .insert({ company_id: companyId, name: "Test Customer", phone, channel: "whatsapp" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function addProfessional(companyId: string, name: string, cookie = owner.cookieHeader) {
  const res = await api<{ professional: { id: string } }>("POST", `/api/companies/${companyId}/professionals`, cookie, { name });
  return { status: res.status, id: res.json?.professional?.id };
}

function ctxFor(s: Seed, customerId = s.customerId): ToolExecutionContext {
  return {
    companyId: s.companyId,
    agentId: s.agentId,
    conversationId: s.conversationId,
    customerId,
    supabase: getTestServiceClient(),
    openai: {} as ToolExecutionContext["openai"],
  };
}

function book(s: Seed, args: Record<string, unknown>, customerId?: string) {
  return bookAppointmentTool.execute({ serviceId: s.serviceId, startsAt: SLOT, intakeAnswers: INTAKE, ...args }, ctxFor(s, customerId));
}

describe("seeded professional", () => {
  it("every new company starts with one active professional named after it", async () => {
    const s = await seed("Barbearia do Zé");
    const res = await api<{ professionals: { name: string; isActive: boolean }[] }>(
      "GET",
      `/api/companies/${s.companyId}/professionals`,
      owner.cookieHeader,
    );
    expect(res.status).toBe(200);
    expect(res.json.professionals).toEqual([expect.objectContaining({ name: "Barbearia do Zé", isActive: true })]);
  });

  it("a single-professional business never exposes professionals to Ana", async () => {
    const s = await seed("Solo Co");
    const services = (await listServicesTool.execute({}, ctxFor(s))) as { services: Record<string, unknown>[] };
    expect(services.services[0]).not.toHaveProperty("professionals");

    const slots = (await findAvailableSlotsTool.execute({ serviceId: s.serviceId, from: DATE, to: DATE }, ctxFor(s))) as {
      slots: Record<string, unknown>[];
    };
    expect(slots.slots.length).toBeGreaterThan(0);
    expect(slots.slots[0]).not.toHaveProperty("professionals");

    const booked = (await book(s, {})) as Record<string, unknown>;
    expect(booked.booked).toBe(true);
    expect(booked).not.toHaveProperty("professionalName");
  });
});

describe("managing professionals", () => {
  it("only owners/admins add professionals", async () => {
    const s = await seed("Admin Only Co");
    const member = await signUpTestUser("member");
    await api("POST", `/api/companies/${s.companyId}/members`, owner.cookieHeader, { userId: member.userId, role: "member" });

    expect((await addProfessional(s.companyId, "Nope", member.cookieHeader)).status).toBe(403);
    expect((await addProfessional(s.companyId, "João")).status).toBe(201);
    expect((await addProfessional(s.companyId, "  ")).status).toBe(400);
  });

  it("won't deactivate the last active professional, or one with upcoming appointments", async () => {
    const s = await seed("Deactivate Co");
    const last = await api<{ error: string }>("DELETE", `/api/companies/${s.companyId}/professionals/${s.first}`, owner.cookieHeader);
    expect(last.status).toBe(409);
    expect(last.json.error).toBe("last_active_professional");

    const joao = await addProfessional(s.companyId, "João");
    expect(((await book(s, { professionalId: joao.id })) as { booked: boolean }).booked).toBe(true);
    const busy = await api<{ error: string; count: number }>(
      "DELETE",
      `/api/companies/${s.companyId}/professionals/${joao.id}`,
      owner.cookieHeader,
    );
    expect(busy.status).toBe(409);
    expect(busy.json).toMatchObject({ error: "has_upcoming_appointments", count: 1 });
  });

  it("writes to professionals are service-role only (no direct PostgREST insert/update)", async () => {
    const s = await seed("RLS Co");
    const insert = await owner.client.from("professionals").insert({ company_id: s.companyId, name: "Hacker" });
    expect(insert.error).not.toBeNull();
    const update = await owner.client.from("professionals").update({ name: "Renamed" }).eq("id", s.first).select();
    expect(update.error).not.toBeNull();
    const read = await owner.client.from("professionals").select("id").eq("company_id", s.companyId);
    expect(read.data).toHaveLength(1);
  });

  it("a linked team member manages their own schedule but not someone else's", async () => {
    const s = await seed("Linked Member Co");
    const member = await signUpTestUser("member");
    await api("POST", `/api/companies/${s.companyId}/members`, owner.cookieHeader, { userId: member.userId, role: "member" });
    const joao = await addProfessional(s.companyId, "João");
    const linked = await api("PATCH", `/api/companies/${s.companyId}/professionals/${joao.id}`, owner.cookieHeader, {
      userId: member.userId,
    });
    expect(linked.status).toBe(200);

    // Own schedule: hours, time off, Google.
    expect(
      (
        await api("PUT", `/api/companies/${s.companyId}/business-hours?professionalId=${joao.id}`, member.cookieHeader, {
          businessHours: [{ day_of_week: 6, start_time: "08:00", end_time: "12:00" }],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api("POST", `/api/companies/${s.companyId}/time-off`, member.cookieHeader, {
          startDate: "2027-04-01",
          endDate: "2027-04-02",
          professionalId: joao.id,
        })
      ).status,
    ).toBe(201);
    expect((await api("POST", `${await calendarPath(s.companyId, joao.id)}/connect`, member.cookieHeader, { code: "good-code" })).status).toBe(200);
    // ...but can't relink themselves elsewhere, or touch another professional.
    expect(
      (await api("PATCH", `/api/companies/${s.companyId}/professionals/${joao.id}`, member.cookieHeader, { userId: null })).status,
    ).toBe(403);
    expect((await api("POST", `${await calendarPath(s.companyId, s.first)}/connect`, member.cookieHeader, { code: "good-code" })).status).toBe(403);
    expect(
      (
        await api("PUT", `/api/companies/${s.companyId}/business-hours?professionalId=${s.first}`, member.cookieHeader, {
          businessHours: [],
        })
      ).status,
    ).toBe(403);
  });
});

describe("one schedule per professional", () => {
  it("two professionals can be booked at the same time; the same one can't", async () => {
    const s = await seed("Parallel Co");
    const joao = await addProfessional(s.companyId, "João");

    const a = (await book(s, { professionalId: s.first })) as { booked: boolean };
    const secondCustomer = await createCustomer(s.companyId);
    const b = (await book(s, { professionalId: joao.id }, secondCustomer)) as { booked: boolean; professionalName: string };
    expect(a.booked).toBe(true);
    expect(b).toMatchObject({ booked: true, professionalName: "João" });

    const thirdCustomer = await createCustomer(s.companyId);
    const clash = (await book(s, { professionalId: joao.id }, thirdCustomer)) as { booked: boolean; reason: string };
    expect(clash).toEqual({ booked: false, reason: "slot_unavailable" });
  });

  it("with no preference, assigns whoever is free at that time", async () => {
    const s = await seed("Any Pro Co");
    const joao = await addProfessional(s.companyId, "João");
    // The seeded professional takes 10:00 first...
    expect(((await book(s, { professionalId: s.first })) as { booked: boolean }).booked).toBe(true);
    // ...so a no-preference booking at 10:00 lands on João.
    const other = await createCustomer(s.companyId);
    const auto = (await book(s, {}, other)) as { booked: boolean; professionalName: string };
    expect(auto).toMatchObject({ booked: true, professionalName: "João" });
    const { data: rows } = await getTestServiceClient().from("appointments").select("professional_id").eq("company_id", s.companyId);
    expect(rows?.map((r) => r.professional_id).sort()).toEqual([s.first, joao.id].sort());
  });

  it("'any professional' availability merges everyone and names who is free; one professional's is theirs alone", async () => {
    const s = await seed("Merge Co");
    const joao = await addProfessional(s.companyId, "João");
    expect(((await book(s, { professionalId: s.first })) as { booked: boolean }).booked).toBe(true);

    const any = (await findAvailableSlotsTool.execute({ serviceId: s.serviceId, from: DATE, to: DATE }, ctxFor(s))) as {
      slots: { start: string; professionals: { id: string }[] }[];
    };
    const ten = any.slots.find((slot) => slot.start === SLOT)!;
    expect(ten.professionals.map((p) => p.id)).toEqual([joao.id]);

    const mine = (await findAvailableSlotsTool.execute(
      { serviceId: s.serviceId, from: DATE, to: DATE, professionalId: s.first },
      ctxFor(s),
    )) as { slots: { start: string }[] };
    expect(mine.slots.some((slot) => slot.start === SLOT)).toBe(false);
  });

  it("'who performs it' restricts a service to chosen professionals", async () => {
    const s = await seed("Restricted Co");
    const joao = await addProfessional(s.companyId, "João");
    const patched = await api("PATCH", `/api/companies/${s.companyId}/services/${s.serviceId}`, owner.cookieHeader, {
      professionalIds: [joao.id],
    });
    expect(patched.status).toBe(200);

    const services = (await listServicesTool.execute({}, ctxFor(s))) as {
      services: { id: string; professionals: { id: string; name: string }[] }[];
    };
    expect(services.services[0].professionals).toEqual([{ id: joao.id, name: "João" }]);

    const refused = (await book(s, { professionalId: s.first })) as { booked: boolean; reason: string };
    expect(refused).toEqual({ booked: false, reason: "professional_not_for_service" });
    const ok = (await book(s, {})) as { booked: boolean; professionalName: string };
    expect(ok).toMatchObject({ booked: true, professionalName: "João" });
  });

  it("a professional's own hours and time off apply only to them", async () => {
    const s = await seed("Own Hours Co");
    const joao = await addProfessional(s.companyId, "João");
    // João works Saturdays only; the establishment (and the seeded one) Mondays.
    await api("PUT", `/api/companies/${s.companyId}/business-hours?professionalId=${joao.id}`, owner.cookieHeader, {
      businessHours: [{ day_of_week: 6, start_time: "08:00", end_time: "10:00" }],
    });

    const joaoMonday = (await findAvailableSlotsTool.execute(
      { serviceId: s.serviceId, from: DATE, to: DATE, professionalId: joao.id },
      ctxFor(s),
    )) as { slots: unknown[]; closedDates: string[] };
    expect(joaoMonday.slots).toEqual([]);
    expect(joaoMonday.closedDates).toEqual([DATE]);

    const joaoSaturday = (await findAvailableSlotsTool.execute(
      { serviceId: s.serviceId, from: SATURDAY, to: SATURDAY, professionalId: joao.id },
      ctxFor(s),
    )) as { slots: unknown[] };
    expect(joaoSaturday.slots.length).toBeGreaterThan(0);

    // The establishment's hours PUT must not wipe João's own schedule.
    await api("PUT", `/api/companies/${s.companyId}/business-hours`, owner.cookieHeader, {
      businessHours: [{ day_of_week: DOW, start_time: "09:00", end_time: "13:00" }],
    });
    const { count } = await getTestServiceClient()
      .from("business_hours")
      .select("id", { count: "exact", head: true })
      .eq("professional_id", joao.id);
    expect(count).toBe(1);

    // Time off for the seeded professional only: their Monday slots vanish,
    // and the result says why.
    await api("POST", `/api/companies/${s.companyId}/time-off`, owner.cookieHeader, {
      startDate: DATE,
      endDate: DATE,
      professionalId: s.first,
    });
    const firstMonday = (await findAvailableSlotsTool.execute(
      { serviceId: s.serviceId, from: DATE, to: DATE, professionalId: s.first },
      ctxFor(s),
    )) as { slots: unknown[]; timeOff: unknown[] };
    expect(firstMonday.slots).toEqual([]);
    expect(firstMonday.timeOff).toHaveLength(1);
  });

  it("reschedule keeps the professional, or moves to another who performs the service", async () => {
    const s = await seed("Reschedule Co");
    const joao = await addProfessional(s.companyId, "João");
    const booked = (await book(s, { professionalId: s.first })) as { appointmentId: string };

    const same = (await rescheduleAppointmentTool.execute(
      { appointmentId: booked.appointmentId, newStartsAt: `${DATE}T11:00:00.000Z` },
      ctxFor(s),
    )) as { rescheduled: boolean };
    expect(same.rescheduled).toBe(true);

    const moved = (await rescheduleAppointmentTool.execute(
      { appointmentId: booked.appointmentId, newStartsAt: `${DATE}T11:00:00.000Z`, professionalId: joao.id },
      ctxFor(s),
    )) as { rescheduled: boolean; professionalName: string };
    expect(moved).toMatchObject({ rescheduled: true, professionalName: "João" });

    const mine = (await listMyAppointmentsTool.execute({}, ctxFor(s))) as {
      appointments: { professionalName: string }[];
    };
    expect(mine.appointments[0].professionalName).toBe("João");
  });
});

describe("Google Calendar per professional", () => {
  it("each professional's appointments go to their own connected calendar", async () => {
    const s = await seed("Two Calendars Co");
    const joao = await addProfessional(s.companyId, "João");
    await api("POST", `${await calendarPath(s.companyId, joao.id)}/connect`, owner.cookieHeader, { code: "good-code" });
    const chosen = await api("PATCH", await calendarPath(s.companyId, joao.id), owner.cookieHeader, {
      googleCalendarId: "barber-joao@group.calendar.google.com",
    });
    expect(chosen.status).toBe(200);

    const res = await api<{ appointment: { google_event_id: string | null; google_calendar_id: string | null } }>(
      "POST",
      `/api/companies/${s.companyId}/appointments`,
      owner.cookieHeader,
      { service_id: s.serviceId, customer_id: s.customerId, starts_at: SLOT, professional_id: joao.id },
    );
    expect(res.status).toBe(201);
    expect(res.json.appointment.google_calendar_id).toBe("barber-joao@group.calendar.google.com");
    const event = await capturedCalendarEvent(res.json.appointment.google_event_id!);
    expect(event?.calendarId).toBe("barber-joao@group.calendar.google.com");

    // The seeded professional has no calendar: their booking syncs nowhere.
    const other = await api<{ appointment: { google_event_id: string | null } }>(
      "POST",
      `/api/companies/${s.companyId}/appointments`,
      owner.cookieHeader,
      { service_id: s.serviceId, customer_id: s.customerId, starts_at: `${DATE}T11:00:00.000Z`, professional_id: s.first },
    );
    expect(other.json.appointment.google_event_id).toBeNull();
  });

  it("lists only writable calendars, refuses an unknown one, and can create a dedicated one", async () => {
    const s = await seed("Calendar Picker Co");
    const base = await calendarPath(s.companyId);
    expect((await api("GET", `${base}/calendars`, owner.cookieHeader)).status).toBe(409); // not connected yet
    await api("POST", `${base}/connect`, owner.cookieHeader, { code: "good-code" });

    const list = await api<{ calendars: { id: string; primary: boolean }[] }>("GET", `${base}/calendars`, owner.cookieHeader);
    expect(list.json.calendars.map((c) => c.id)).toEqual(["owner@example.test", "barber-joao@group.calendar.google.com"]);

    expect((await api("PATCH", base, owner.cookieHeader, { googleCalendarId: "someone-elses" })).status).toBe(400);

    const created = await api<{ calendar: { id: string } }>("POST", `${base}/calendars`, owner.cookieHeader);
    expect(created.status).toBe(201);
    const status = await api<{ connection: { google_calendar_id: string } }>("GET", base, owner.cookieHeader);
    expect(status.json.connection.google_calendar_id).toBe(created.json.calendar.id);
  });
});
