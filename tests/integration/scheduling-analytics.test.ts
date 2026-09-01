import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { loadSchedulingAnalytics } from "@/lib/analytics/scheduling";

// Scheduling metrics for the Performance page (src/lib/analytics/scheduling.ts).
// Real local Postgres + RLS throughout, same as the E2 analytics file.
// Appointments are COMPANY-scoped (not agent-scoped) and bucket on
// `created_at` (when the booking was taken) — so a row's `starts_at` is
// irrelevant to the counts and these seeds put it well in the future.

const WINDOW_FROM = "2026-06-01";
const WINDOW_TO = "2026-06-30";

async function seed(owner: Awaited<ReturnType<typeof signUpTestUser>>, name: string) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
    name,
  });
  const companyId = created.json.company.id;

  const hireAna = await api<{ companyAgent: { agent_id: string } }>(
    "POST",
    `/api/companies/${companyId}/agents/ana`,
    owner.cookieHeader,
  );
  const anaId = hireAna.json.companyAgent.agent_id;

  const { data: customer, error: customerError } = await owner.client
    .from("customers")
    .insert({ company_id: companyId, name: "Sched Customer", channel: "whatsapp" })
    .select("id")
    .single();
  if (customerError) throw customerError;

  return { companyId, anaId, customerId: customer.id as string };
}

async function insertConversation(
  owner: Awaited<ReturnType<typeof signUpTestUser>>,
  companyId: string,
  agentId: string,
  customerId: string,
  createdAt: string,
) {
  const { error } = await owner.client.from("conversations").insert({
    company_id: companyId,
    agent_id: agentId,
    customer_id: customerId,
    channel: "whatsapp",
    status: "active",
    created_at: createdAt,
  });
  if (error) throw error;
}

async function insertAppointment(
  owner: Awaited<ReturnType<typeof signUpTestUser>>,
  args: {
    companyId: string;
    agentId: string | null;
    customerId: string;
    status: "confirmed" | "completed" | "cancelled" | "requested";
    createdAt: string;
    // distinct day in 2027 so the EXCLUDE constraint (no overlapping bookings
    // per company) is never hit; the slot date itself doesn't affect counts.
    slotDay: number;
  },
) {
  const startsAt = new Date(Date.UTC(2027, 0, args.slotDay, 9, 0, 0)).toISOString();
  const endsAt = new Date(Date.UTC(2027, 0, args.slotDay, 9, 30, 0)).toISOString();
  const { error } = await owner.client.from("appointments").insert({
    company_id: args.companyId,
    agent_id: args.agentId,
    customer_id: args.customerId,
    status: args.status,
    starts_at: startsAt,
    ends_at: endsAt,
    created_at: args.createdAt,
  });
  if (error) throw error;
}

function total(
  res: Awaited<ReturnType<typeof loadSchedulingAnalytics>>,
  key: string,
): number {
  const found = res.metrics.find((m) => m.metric === key);
  if (!found) throw new Error(`metric ${key} missing`);
  return found.total;
}

describe("loadSchedulingAnalytics", () => {
  it("counts conversations and appointments booked in the window, split by status", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, anaId, customerId } = await seed(owner, "Sched Metrics Co");

    for (const day of ["05", "12", "20"]) {
      await insertConversation(owner, companyId, anaId, customerId, `2026-06-${day}T12:00:00.000Z`);
    }

    // All five booked inside the window. Their slots are in 2027 — including
    // the confirmed ones, which are still "upcoming" — and every one counts.
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "confirmed", createdAt: "2026-06-05T09:00:00.000Z", slotDay: 1 });
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "confirmed", createdAt: "2026-06-06T09:00:00.000Z", slotDay: 2 });
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "completed", createdAt: "2026-06-10T09:00:00.000Z", slotDay: 3 });
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "cancelled", createdAt: "2026-06-15T09:00:00.000Z", slotDay: 4 });
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "requested", createdAt: "2026-06-18T09:00:00.000Z", slotDay: 5 });

    const res = await loadSchedulingAnalytics({
      supabase: owner.client,
      companyId,
      agentId: anaId,
      timezone: "UTC",
      granularity: "day",
      from: WINDOW_FROM,
      to: WINDOW_TO,
    });

    expect(total(res, "conversations")).toBe(3);
    expect(total(res, "appointments_booked")).toBe(5);
    expect(total(res, "appointments_completed")).toBe(1);
    expect(total(res, "appointments_cancelled")).toBe(1);
  });

  it("mirrors a real account: one completed + one cancelled + one still-future all count", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, anaId, customerId } = await seed(owner, "Sched Real Co");

    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "completed", createdAt: "2026-06-11T09:00:00.000Z", slotDay: 10 });
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "cancelled", createdAt: "2026-06-14T09:00:00.000Z", slotDay: 11 });
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "confirmed", createdAt: "2026-06-19T09:00:00.000Z", slotDay: 12 });

    const res = await loadSchedulingAnalytics({
      supabase: owner.client,
      companyId,
      agentId: anaId,
      timezone: "UTC",
      granularity: "day",
      from: WINDOW_FROM,
      to: WINDOW_TO,
    });

    expect(total(res, "appointments_booked")).toBe(3);
    expect(total(res, "appointments_completed")).toBe(1);
    expect(total(res, "appointments_cancelled")).toBe(1);
  });

  it("scopes appointments to the company (any agent_id) and conversations to the agent", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, anaId, customerId } = await seed(owner, "Sched Scoping Co");

    // Second agent in the same company. Her conversation must NOT count; a
    // Malu-tagged appointment and one with no agent_id both SHOULD.
    const hireMalu = await api<{ companyAgent: { agent_id: string } }>(
      "POST",
      `/api/companies/${companyId}/agents/malu`,
      owner.cookieHeader,
    );
    const maluId = hireMalu.json.companyAgent.agent_id;
    await insertConversation(owner, companyId, maluId, customerId, "2026-06-07T12:00:00.000Z");
    await insertAppointment(owner, { companyId, agentId: maluId, customerId, status: "confirmed", createdAt: "2026-06-07T09:00:00.000Z", slotDay: 20 });
    await insertAppointment(owner, { companyId, agentId: null, customerId, status: "confirmed", createdAt: "2026-06-08T09:00:00.000Z", slotDay: 21 });

    // Other company — nothing from it counts.
    const other = await seed(owner, "Sched Other Co");
    await insertConversation(owner, other.companyId, other.anaId, other.customerId, "2026-06-08T12:00:00.000Z");
    await insertAppointment(owner, { companyId: other.companyId, agentId: other.anaId, customerId: other.customerId, status: "completed", createdAt: "2026-06-08T09:00:00.000Z", slotDay: 22 });

    // Ana's own booking + conversation in the target company.
    await insertConversation(owner, companyId, anaId, customerId, "2026-06-09T12:00:00.000Z");
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "confirmed", createdAt: "2026-06-09T09:00:00.000Z", slotDay: 23 });

    const res = await loadSchedulingAnalytics({
      supabase: owner.client,
      companyId,
      agentId: anaId,
      timezone: "UTC",
      granularity: "day",
      from: WINDOW_FROM,
      to: WINDOW_TO,
    });

    expect(total(res, "conversations")).toBe(1);
    expect(total(res, "appointments_booked")).toBe(3);
  });

  it("ignores a booking taken outside the window even if its slot is inside", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, anaId, customerId } = await seed(owner, "Sched Outside Co");

    // Booked in May, slot in June: created_at is what's checked, so it drops.
    const { error } = await owner.client.from("appointments").insert({
      company_id: companyId,
      agent_id: anaId,
      customer_id: customerId,
      status: "completed",
      starts_at: new Date(Date.UTC(2026, 5, 10, 9, 0, 0)).toISOString(),
      ends_at: new Date(Date.UTC(2026, 5, 10, 9, 30, 0)).toISOString(),
      created_at: "2026-05-20T09:00:00.000Z",
    });
    if (error) throw error;

    const res = await loadSchedulingAnalytics({
      supabase: owner.client,
      companyId,
      agentId: anaId,
      timezone: "UTC",
      granularity: "day",
      from: WINDOW_FROM,
      to: WINDOW_TO,
    });

    expect(total(res, "appointments_booked")).toBe(0);
  });

  it("zero-fills every day in the range for a company with no activity", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, anaId } = await seed(owner, "Sched Empty Co");

    const res = await loadSchedulingAnalytics({
      supabase: owner.client,
      companyId,
      agentId: anaId,
      timezone: "UTC",
      granularity: "day",
      from: WINDOW_FROM,
      to: WINDOW_TO,
    });

    const booked = res.metrics.find((m) => m.metric === "appointments_booked");
    expect(booked?.total).toBe(0);
    expect(booked?.series).toHaveLength(30);
    expect(booked?.series.every((p) => p.count === 0)).toBe(true);
  });
});
