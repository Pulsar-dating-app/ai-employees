import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { loadSchedulingAnalytics } from "@/lib/analytics/scheduling";

// Per-agent scheduling metrics for the Performance page (src/lib/analytics/
// scheduling.ts). Real local Postgres + RLS throughout, same as the E2
// analytics file. Rows are seeded with explicit `created_at` in a fixed past
// window so bucket totals don't depend on "today".

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
    agentId: string;
    customerId: string;
    status: "confirmed" | "completed" | "cancelled" | "requested";
    // distinct hour on one fixed day, so the EXCLUDE constraint (no
    // overlapping bookings per company) is never hit. `starts_at` itself is
    // not read by loadSchedulingAnalytics — it buckets on `created_at`.
    slot: number;
    createdAt: string;
  },
) {
  const startsAt = new Date(Date.UTC(2026, 6, 1, args.slot, 0, 0)).toISOString();
  const endsAt = new Date(Date.UTC(2026, 6, 1, args.slot, 30, 0)).toISOString();
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
  it("counts an agent's conversations and appointments, split by status", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, anaId, customerId } = await seed(owner, "Sched Metrics Co");

    for (const day of ["05", "12", "20"]) {
      await insertConversation(owner, companyId, anaId, customerId, `2026-06-${day}T12:00:00.000Z`);
    }

    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "confirmed", slot: 1, createdAt: "2026-06-05T09:00:00.000Z" });
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "confirmed", slot: 2, createdAt: "2026-06-06T09:00:00.000Z" });
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "completed", slot: 3, createdAt: "2026-06-10T09:00:00.000Z" });
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "cancelled", slot: 4, createdAt: "2026-06-15T09:00:00.000Z" });
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "requested", slot: 5, createdAt: "2026-06-18T09:00:00.000Z" });

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

  it("excludes another agent's rows and another company's rows", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, anaId, customerId } = await seed(owner, "Sched Scoping Co");

    // A second agent in the same company (Malu), with her own activity.
    const hireMalu = await api<{ companyAgent: { agent_id: string } }>(
      "POST",
      `/api/companies/${companyId}/agents/malu`,
      owner.cookieHeader,
    );
    const maluId = hireMalu.json.companyAgent.agent_id;
    await insertConversation(owner, companyId, maluId, customerId, "2026-06-07T12:00:00.000Z");
    await insertAppointment(owner, { companyId, agentId: maluId, customerId, status: "confirmed", slot: 8, createdAt: "2026-06-07T09:00:00.000Z" });

    // A whole other company, also running Ana.
    const other = await seed(owner, "Sched Other Co");
    await insertConversation(owner, other.companyId, other.anaId, other.customerId, "2026-06-08T12:00:00.000Z");
    await insertAppointment(owner, { companyId: other.companyId, agentId: other.anaId, customerId: other.customerId, status: "completed", slot: 9, createdAt: "2026-06-08T09:00:00.000Z" });

    // Ana's own single booking + conversation in the target company.
    await insertConversation(owner, companyId, anaId, customerId, "2026-06-09T12:00:00.000Z");
    await insertAppointment(owner, { companyId, agentId: anaId, customerId, status: "confirmed", slot: 10, createdAt: "2026-06-09T09:00:00.000Z" });

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
    expect(total(res, "appointments_booked")).toBe(1);
  });

  it("zero-fills every day in the range for an agent with no activity", async () => {
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
