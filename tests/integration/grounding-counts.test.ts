import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { seedActivePlan } from "./helpers/billing";
import { loadGroundingCounts, localDayRangeUtc } from "@/lib/analytics/grounding";

// The query behind the Metrics reliability card, exercised against real
// Postgres. It had no test when it shipped, and the thing it got wrong --
// counting a reply with no figure in it as a verified answer -- is exactly
// what a merchant then saw on their dashboard.
describe("loadGroundingCounts", () => {
  type Seed = { status: string; claims: number; agent?: "malu" | "ana"; daysAgo?: number };

  async function seedCompany(seeds: Seed[]) {
    const owner = await signUpTestUser("owner");
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
      name: `Counts Co ${randomUUID().slice(0, 8)}`,
    });
    const companyId = created.json.company.id;
    await seedActivePlan(companyId);
    await api("POST", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader);
    await api("POST", `/api/companies/${companyId}/agents/ana`, owner.cookieHeader);

    const svc = getTestServiceClient();
    const agentIds: Record<string, string> = {};
    for (const slug of ["malu", "ana"]) {
      const { data } = await svc.from("agents").select("id").eq("slug", slug).single();
      agentIds[slug] = (data as { id: string }).id;
    }

    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: companyId, channel: "web_chat", web_chat_session_id: randomUUID() })
      .select("id")
      .single();

    const conversations: Record<string, string> = {};
    for (const slug of ["malu", "ana"]) {
      const { data } = await svc
        .from("conversations")
        .insert({
          company_id: companyId,
          agent_id: agentIds[slug],
          customer_id: (customer as { id: string }).id,
          channel: "web_chat",
          status: "active",
        })
        .select("id")
        .single();
      conversations[slug] = (data as { id: string }).id;
    }

    await svc.from("messages").insert(
      seeds.map((seed) => ({
        company_id: companyId,
        conversation_id: conversations[seed.agent ?? "malu"],
        role: "agent",
        content: "reply",
        created_at: new Date(Date.now() - (seed.daysAgo ?? 0) * 86_400_000).toISOString(),
        metadata: { grounding: { status: seed.status, violations: [], claims: seed.claims } },
      })),
    );

    return { companyId, agentIds };
  }

  function todayRange() {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    return localDayRangeUtc(from, to, "UTC");
  }

  it("counts a grounded reply only when it actually stated a figure", async () => {
    const { companyId } = await seedCompany([
      { status: "grounded", claims: 2 },
      { status: "grounded", claims: 1 },
      { status: "grounded", claims: 0 },
      { status: "grounded", claims: 0 },
      { status: "grounded", claims: 0 },
    ]);
    const { startUtc, endUtc } = todayRange();

    const counts = await loadGroundingCounts({
      supabase: getTestServiceClient(),
      companyId,
      startUtc,
      endUtc,
    });

    expect(counts).toEqual({ verified: 2, regenerated: 0, blocked: 0 });
  });

  it("counts every intervention regardless of the claim count on the sent text", async () => {
    const { companyId } = await seedCompany([
      { status: "regenerated", claims: 1 },
      { status: "blocked", claims: 0 },
      { status: "blocked", claims: 0 },
      { status: "grounded", claims: 1 },
    ]);
    const { startUtc, endUtc } = todayRange();

    const counts = await loadGroundingCounts({
      supabase: getTestServiceClient(),
      companyId,
      startUtc,
      endUtc,
    });

    expect(counts).toEqual({ verified: 1, regenerated: 1, blocked: 2 });
  });

  it("never counts a row written before claims existed", async () => {
    const owner = await signUpTestUser("owner");
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
      name: `Legacy Co ${randomUUID().slice(0, 8)}`,
    });
    const companyId = created.json.company.id;
    await seedActivePlan(companyId);
    await api("POST", `/api/companies/${companyId}/agents/malu`, owner.cookieHeader);

    const svc = getTestServiceClient();
    const { data: agent } = await svc.from("agents").select("id").eq("slug", "malu").single();
    const { data: customer } = await svc
      .from("customers")
      .insert({ company_id: companyId, channel: "web_chat", web_chat_session_id: randomUUID() })
      .select("id")
      .single();
    const { data: conversation } = await svc
      .from("conversations")
      .insert({
        company_id: companyId,
        agent_id: (agent as { id: string }).id,
        customer_id: (customer as { id: string }).id,
        channel: "web_chat",
        status: "active",
      })
      .select("id")
      .single();

    await svc.from("messages").insert([
      {
        company_id: companyId,
        conversation_id: (conversation as { id: string }).id,
        role: "agent",
        content: "pre-claims row",
        metadata: { grounding: { status: "grounded", violations: [] } },
      },
    ]);

    const { startUtc, endUtc } = todayRange();
    const counts = await loadGroundingCounts({
      supabase: getTestServiceClient(),
      companyId,
      startUtc,
      endUtc,
    });

    expect(counts).toEqual({ verified: 0, regenerated: 0, blocked: 0 });
  });

  it("scopes to one agent when asked", async () => {
    const { companyId, agentIds } = await seedCompany([
      { status: "grounded", claims: 1, agent: "malu" },
      { status: "grounded", claims: 1, agent: "malu" },
      { status: "grounded", claims: 1, agent: "ana" },
      { status: "blocked", claims: 0, agent: "ana" },
    ]);
    const { startUtc, endUtc } = todayRange();
    const supabase = getTestServiceClient();

    expect(
      await loadGroundingCounts({ supabase, companyId, startUtc, endUtc, agentId: agentIds.malu }),
    ).toEqual({ verified: 2, regenerated: 0, blocked: 0 });
    expect(
      await loadGroundingCounts({ supabase, companyId, startUtc, endUtc, agentId: agentIds.ana }),
    ).toEqual({ verified: 1, regenerated: 0, blocked: 1 });
  });

  it("leaves out replies outside the selected period", async () => {
    const { companyId } = await seedCompany([
      { status: "grounded", claims: 1 },
      { status: "grounded", claims: 1, daysAgo: 30 },
      { status: "blocked", claims: 0, daysAgo: 30 },
    ]);
    const { startUtc, endUtc } = todayRange();

    const counts = await loadGroundingCounts({
      supabase: getTestServiceClient(),
      companyId,
      startUtc,
      endUtc,
    });

    expect(counts).toEqual({ verified: 1, regenerated: 0, blocked: 0 });
  });
});
