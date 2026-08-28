import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello ticket E2 -- the analytics aggregation API F6's dashboard reads.
// Real local Postgres throughout (real signed-up users, real RLS), same as
// every other file here. Rows are seeded with explicit `created_at` values
// in a fixed past window so bucketing assertions don't depend on "today".

type MetricSeriesPoint = { date: string; count: number };
type MetricSeries = { metric: string; total: number; series: MetricSeriesPoint[] };
type AnalyticsResponse = {
  granularity: "day" | "week";
  timezone: string;
  range: { from: string; to: string };
  metrics: MetricSeries[];
};

async function seedCompany(
  owner: Awaited<ReturnType<typeof signUpTestUser>>,
  name: string,
  timezone?: string,
) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
    name,
  });
  const companyId = created.json.company.id;

  if (timezone) {
    await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, { timezone });
  }

  const hired = await api<{ companyAgent: { agent_id: string } }>(
    "POST",
    `/api/companies/${companyId}/agents/malu`,
    owner.cookieHeader,
  );
  const agentId = hired.json.companyAgent.agent_id;

  const { data: customer, error: customerError } = await owner.client
    .from("customers")
    .insert({ company_id: companyId, name: "Seed Customer", channel: "whatsapp" })
    .select("id")
    .single();
  if (customerError) throw customerError;

  const { data: conversation, error: conversationError } = await owner.client
    .from("conversations")
    .insert({
      company_id: companyId,
      agent_id: agentId,
      customer_id: customer.id,
      channel: "whatsapp",
      status: "active",
    })
    .select("id")
    .single();
  if (conversationError) throw conversationError;

  return { companyId, agentId, customerId: customer.id as string, conversationId: conversation.id as string };
}

async function insertConversationAt(
  owner: Awaited<ReturnType<typeof signUpTestUser>>,
  seed: Awaited<ReturnType<typeof seedCompany>>,
  createdAt: string,
) {
  const { error } = await owner.client.from("conversations").insert({
    company_id: seed.companyId,
    agent_id: seed.agentId,
    customer_id: seed.customerId,
    channel: "whatsapp",
    status: "active",
    created_at: createdAt,
  });
  if (error) throw error;
}

async function insertCustomerAt(
  owner: Awaited<ReturnType<typeof signUpTestUser>>,
  seed: Awaited<ReturnType<typeof seedCompany>>,
  createdAt: string,
) {
  const { error } = await owner.client.from("customers").insert({
    company_id: seed.companyId,
    name: "Extra Customer",
    channel: "whatsapp",
    created_at: createdAt,
  });
  if (error) throw error;
}

async function insertEventAt(
  owner: Awaited<ReturnType<typeof signUpTestUser>>,
  seed: Awaited<ReturnType<typeof seedCompany>>,
  type: "product_recommendation" | "buying_intent" | "checkout_click",
  createdAt: string,
) {
  const { error } = await owner.client.from("events").insert({
    company_id: seed.companyId,
    agent_id: seed.agentId,
    conversation_id: seed.conversationId,
    customer_id: seed.customerId,
    type,
    created_at: createdAt,
  });
  if (error) throw error;
}

function metric(res: AnalyticsResponse, key: string): MetricSeries {
  const found = res.metrics.find((m) => m.metric === key);
  if (!found) throw new Error(`metric ${key} missing from response`);
  return found;
}

describe("GET /api/companies/[companyId]/analytics", () => {
  it("403s for a non-member", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedCompany(owner, "Analytics Members Only Co");

    const stranger = await signUpTestUser("stranger");
    const res = await api(
      "GET",
      `/api/companies/${seed.companyId}/analytics`,
      stranger.cookieHeader,
    );

    expect(res.status).toBe(403);
  });

  it("returns the five spec §15 metrics as zeroed, continuous day series for an empty company", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedCompany(owner, "Empty Analytics Co");

    const res = await api<AnalyticsResponse>(
      "GET",
      `/api/companies/${seed.companyId}/analytics?from=2026-06-01&to=2026-06-05`,
      owner.cookieHeader,
    );

    expect(res.status).toBe(200);
    expect(res.json.granularity).toBe("day");
    expect(res.json.range).toEqual({ from: "2026-06-01", to: "2026-06-05" });
    expect(res.json.metrics.map((m) => m.metric)).toEqual([
      "conversations",
      "customers",
      "product_recommendations",
      "buying_intent",
      "checkout_clicks",
    ]);
    for (const m of res.json.metrics) {
      expect(m.total).toBe(0);
      expect(m.series).toHaveLength(5);
      expect(m.series.every((p) => p.count === 0)).toBe(true);
    }
    // The seedCompany conversation/customer exist but were created "now",
    // far outside the June window -- so they must not be counted.
  });

  it("counts conversations, customers and each event type into day buckets, scoped to the company", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedCompany(owner, "Busy Analytics Co", "UTC");
    const other = await seedCompany(owner, "Other Tenant Analytics Co", "UTC");

    // In-window activity for the company under test.
    await insertConversationAt(owner, seed, "2026-05-10T08:00:00Z");
    await insertConversationAt(owner, seed, "2026-05-10T20:00:00Z");
    await insertConversationAt(owner, seed, "2026-05-12T09:00:00Z");
    await insertCustomerAt(owner, seed, "2026-05-11T09:00:00Z");
    await insertEventAt(owner, seed, "product_recommendation", "2026-05-10T10:00:00Z");
    await insertEventAt(owner, seed, "product_recommendation", "2026-05-12T10:00:00Z");
    await insertEventAt(owner, seed, "buying_intent", "2026-05-12T11:00:00Z");
    await insertEventAt(owner, seed, "checkout_click", "2026-05-12T12:00:00Z");

    // Noise: another tenant's activity in the same window must not leak in.
    await insertConversationAt(owner, other, "2026-05-10T08:00:00Z");
    await insertEventAt(owner, other, "buying_intent", "2026-05-12T11:00:00Z");

    // Noise: this tenant, but outside the requested window.
    await insertEventAt(owner, seed, "checkout_click", "2026-05-20T12:00:00Z");

    const res = await api<AnalyticsResponse>(
      "GET",
      `/api/companies/${seed.companyId}/analytics?from=2026-05-10&to=2026-05-13`,
      owner.cookieHeader,
    );

    expect(res.status).toBe(200);

    const conversations = metric(res.json, "conversations");
    expect(conversations.total).toBe(3);
    expect(conversations.series).toEqual([
      { date: "2026-05-10", count: 2 },
      { date: "2026-05-11", count: 0 },
      { date: "2026-05-12", count: 1 },
      { date: "2026-05-13", count: 0 },
    ]);

    expect(metric(res.json, "customers").total).toBe(1);
    expect(metric(res.json, "customers").series[1]).toEqual({ date: "2026-05-11", count: 1 });

    expect(metric(res.json, "product_recommendations").total).toBe(2);
    expect(metric(res.json, "buying_intent").total).toBe(1);
    expect(metric(res.json, "checkout_clicks").total).toBe(1); // the May 20 one is out of range
  });

  it("groups into weekly buckets when granularity=week", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedCompany(owner, "Weekly Analytics Co", "UTC");

    await insertEventAt(owner, seed, "buying_intent", "2026-05-05T10:00:00Z"); // week of Mon May 4
    await insertEventAt(owner, seed, "buying_intent", "2026-05-07T10:00:00Z"); // same week
    await insertEventAt(owner, seed, "buying_intent", "2026-05-12T10:00:00Z"); // week of Mon May 11

    const res = await api<AnalyticsResponse>(
      "GET",
      `/api/companies/${seed.companyId}/analytics?granularity=week&from=2026-05-04&to=2026-05-17`,
      owner.cookieHeader,
    );

    expect(res.status).toBe(200);
    expect(res.json.granularity).toBe("week");
    const buyingIntent = metric(res.json, "buying_intent");
    expect(buyingIntent.total).toBe(3);
    expect(buyingIntent.series).toEqual([
      { date: "2026-05-04", count: 2 },
      { date: "2026-05-11", count: 1 },
    ]);
  });

  it("400s when from is after to", async () => {
    const owner = await signUpTestUser("owner");
    const seed = await seedCompany(owner, "Bad Range Analytics Co");

    const res = await api(
      "GET",
      `/api/companies/${seed.companyId}/analytics?from=2026-06-10&to=2026-06-01`,
      owner.cookieHeader,
    );

    expect(res.status).toBe(400);
  });
});
